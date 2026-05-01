FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

# Register reference plugins (mlair.plugins) so pipeline contract validation sees
# app_etl_adapter / app_train_adapter / echo_tracking (reference demo DAG + examples).
RUN pip install --no-cache-dir /app/builtin_reference_plugins

EXPOSE 8080

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8080"]
