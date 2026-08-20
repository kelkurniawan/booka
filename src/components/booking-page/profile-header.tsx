import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function BookingProfileHeader({
  name,
  bio,
  avatarUrl,
}: {
  name: string;
  bio: string | null;
  avatarUrl: string | null;
}) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <Avatar size="lg" className="size-16">
        <AvatarImage src={avatarUrl ?? undefined} alt={name} />
        <AvatarFallback className="text-lg">
          {(name || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <h1
          className="text-xl font-semibold tracking-tight text-balance"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {name}
        </h1>
        {bio ? <p className="text-muted-foreground text-sm text-pretty">{bio}</p> : null}
      </div>
    </header>
  );
}
