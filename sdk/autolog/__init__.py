"""Framework autolog integrations (Phase 5.4)."""

from __future__ import annotations

import functools
import inspect
from typing import Any, Callable

from sdk.mlair import log_metric, log_param

_ENABLED = False
_FRAMEWORK: str | None = None


def autolog(framework: str | None = None) -> None:
    """Enable automatic metric/param logging for supported ML frameworks."""
    global _ENABLED, _FRAMEWORK
    if _ENABLED:
        return
    resolved = (framework or "auto").strip().lower()
    if resolved in {"auto", ""}:
        resolved = _detect_framework()
    if resolved == "pytorch":
        _enable_pytorch()
    elif resolved in {"sklearn", "scikit-learn"}:
        _enable_sklearn()
    elif resolved == "xgboost":
        _enable_xgboost()
    else:
        raise ValueError(f"unsupported_autolog_framework:{resolved}")
    _ENABLED = True
    _FRAMEWORK = resolved


def _detect_framework() -> str:
    for name in ("torch", "sklearn", "xgboost"):
        try:
            __import__(name)
            if name == "torch":
                return "pytorch"
            return name
        except ImportError:
            continue
    raise ValueError("no_supported_framework_installed")


def _enable_pytorch() -> None:
    import torch

    if getattr(torch.nn.Module, "_mlair_autologged", False):
        return

    original_train = torch.nn.Module.train

    @functools.wraps(original_train)
    def train_wrapper(self, mode: bool = True):
        return original_train(self, mode)

    torch.nn.Module.train = train_wrapper  # type: ignore[method-assign]

    try:
        from torch.utils.tensorboard.writer import SummaryWriter
    except ImportError:
        SummaryWriter = None  # type: ignore[assignment,misc]

    if SummaryWriter is not None and not getattr(SummaryWriter, "_mlair_autologged", False):
        original_add_scalar = SummaryWriter.add_scalar

        def add_scalar_wrapper(writer, tag, scalar_value, global_step=None, *args, **kwargs):
            try:
                log_metric(str(tag), float(scalar_value), step=int(global_step or 0))
            except Exception:
                pass
            return original_add_scalar(writer, tag, scalar_value, global_step, *args, **kwargs)

        SummaryWriter.add_scalar = add_scalar_wrapper  # type: ignore[method-assign]
        SummaryWriter._mlair_autologged = True  # type: ignore[attr-defined]

    try:
        from torch.optim import Optimizer

        if not getattr(Optimizer, "_mlair_autolog_step", False):
            original_step = Optimizer.step

            @functools.wraps(original_step)
            def step_wrapper(optimizer, *args, **kwargs):
                out = original_step(optimizer, *args, **kwargs)
                for idx, group in enumerate(optimizer.param_groups):
                    lr = group.get("lr")
                    if lr is not None:
                        try:
                            log_metric(f"lr/group_{idx}", float(lr), step=getattr(optimizer, "_mlair_step", 0))
                        except Exception:
                            pass
                setattr(optimizer, "_mlair_step", int(getattr(optimizer, "_mlair_step", 0)) + 1)
                return out

            Optimizer.step = step_wrapper  # type: ignore[method-assign]
            Optimizer._mlair_autolog_step = True  # type: ignore[attr-defined]
    except ImportError:
        pass

    torch.nn.Module._mlair_autologged = True  # type: ignore[attr-defined]


def _enable_sklearn() -> None:
    import sklearn.base

    if getattr(sklearn.base.BaseEstimator, "_mlair_autologged", False):
        return

    original_fit = sklearn.base.BaseEstimator.fit

    @functools.wraps(original_fit)
    def fit_wrapper(estimator, X, y=None, *args, **kwargs):
        _log_sklearn_params(estimator)
        result = original_fit(estimator, X, y, *args, **kwargs)
        _log_sklearn_post_fit(estimator, X, y)
        return result

    sklearn.base.BaseEstimator.fit = fit_wrapper  # type: ignore[method-assign]
    sklearn.base.BaseEstimator._mlair_autologged = True  # type: ignore[attr-defined]


def _log_sklearn_params(estimator: Any) -> None:
    params = getattr(estimator, "get_params", lambda: {})()
    for key, value in params.items():
        try:
            log_param(str(key), str(value))
        except Exception:
            continue


def _log_sklearn_post_fit(estimator: Any, X: Any, y: Any) -> None:
    score_callable: Callable[..., float] | None = getattr(estimator, "score", None)
    if not callable(score_callable):
        return
    try:
        score = float(score_callable(X, y))
        log_metric("score", score, step=0)
    except Exception:
        return


def _enable_xgboost() -> None:
    import xgboost as xgb

    if getattr(xgb, "_mlair_autologged", False):
        return

    original_train = xgb.train

    @functools.wraps(original_train)
    def train_wrapper(params, dtrain, num_boost_round=10, *, evals=None, **kwargs):
        for key, value in (params or {}).items():
            try:
                log_param(str(key), str(value))
            except Exception:
                continue

        def _callback(env):
            for name, value in env.evaluation_result_list:
                try:
                    log_metric(str(name).replace("-", "_"), float(value), step=int(env.iteration))
                except Exception:
                    continue

        callbacks = list(kwargs.pop("callbacks", []) or [])
        callbacks.append(_callback)
        return original_train(
            params,
            dtrain,
            num_boost_round=num_boost_round,
            evals=evals,
            callbacks=callbacks,
            **kwargs,
        )

    xgb.train = train_wrapper  # type: ignore[method-assign]
    xgb._mlair_autologged = True  # type: ignore[attr-defined]

    if hasattr(xgb, "XGBClassifier"):
        _patch_xgboost_estimator(xgb.XGBClassifier)
    if hasattr(xgb, "XGBRegressor"):
        _patch_xgboost_estimator(xgb.XGBRegressor)


def _patch_xgboost_estimator(estimator_cls: Any) -> None:
    if getattr(estimator_cls, "_mlair_autologged", False):
        return
    original_fit = estimator_cls.fit

    @functools.wraps(original_fit)
    def fit_wrapper(estimator, X, y=None, **kwargs):
        params = getattr(estimator, "get_params", lambda: {})()
        for key, value in params.items():
            if inspect.isclass(value) or callable(value):
                continue
            try:
                log_param(str(key), str(value))
            except Exception:
                continue
        result = original_fit(estimator, X, y, **kwargs)
        evals_result = getattr(estimator, "evals_result", lambda: {})()
        for dataset_name, metrics in (evals_result() if callable(evals_result) else evals_result).items():
            if not isinstance(metrics, dict):
                continue
            for metric_name, series in metrics.items():
                if not isinstance(series, list):
                    continue
                for step, value in enumerate(series):
                    try:
                        log_metric(f"{dataset_name}.{metric_name}", float(value), step=step)
                    except Exception:
                        continue
        return result

    estimator_cls.fit = fit_wrapper  # type: ignore[method-assign]
    estimator_cls._mlair_autologged = True  # type: ignore[attr-defined]
