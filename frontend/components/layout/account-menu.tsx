"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppContext } from "@/lib/app-context";
import { fetchIdentityMe } from "@/lib/identity-api";
import {
  loadProfileAvatar,
  PROFILE_AVATAR_UPDATED_EVENT,
} from "@/lib/profile-avatar";

function initialsFromUsername(username: string | null): string {
  const value = String(username || "").trim();
  if (!value) return "?";
  const parts = value.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

export function AccountMenu() {
  const { token, username, logout } = useAppContext();
  const meQuery = useQuery({
    queryKey: ["identity-me", token],
    queryFn: () => fetchIdentityMe(token),
    enabled: Boolean(token.trim()),
    staleTime: 60_000,
  });
  const userId = meQuery.data?.id;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(loadProfileAvatar(userId));
  }, [userId]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && userId && detail.userId !== userId) return;
      setAvatarUrl(loadProfileAvatar(userId));
    };
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, onUpdated);
  }, [userId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full border-border bg-background p-0 text-muted-foreground transition-default hover:bg-accent/40 hover:text-foreground pressable"
          aria-label="Account menu"
        >
          <Avatar className="h-8 w-8">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
              {initialsFromUsername(username)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-md border-border/60 bg-card">
        <DropdownMenuLabel className="truncate font-normal">
          <p className="text-sm font-medium text-foreground">{username || "Account"}</p>
          <p className="text-xs text-muted-foreground">Signed in</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-muted" />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings/profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-muted" />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => void logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
