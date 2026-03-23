import type { VideoContent } from "@/types/learning";

interface Props {
  data: VideoContent;
  title: string;
}

export function VideoPlayer({ data, title }: Props) {
  const embedUrl = deriveEmbedUrl(data.url);
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black">
        <iframe
          title={title}
          src={embedUrl}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {data.duration_seconds ? <p className="text-sm text-slate-400">Duration · {Math.round(data.duration_seconds / 60)} min</p> : null}
    </div>
  );
}

function deriveEmbedUrl(url: string) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host.includes("youtu.be")) {
      const videoId = parsed.pathname.replace("/", "");
      return `https://www.youtube.com/embed/${videoId}`;
    }
    if (host.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const videoId = parsed.searchParams.get("v");
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const videoId = parsed.pathname.split("/")[2];
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return url;
      }
    }
  } catch (error) {
    return url;
  }
  return url;
}
