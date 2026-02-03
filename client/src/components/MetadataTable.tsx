import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoMetadata } from '@/lib/mediainfo';
import { FileVideo, Film, Music, Info } from 'lucide-react';
import { filesize as formatFilesize } from 'filesize';

export function MetadataTable({ data }: { data: VideoMetadata }) {
  const isFallback = data.source !== 'mediainfo';

  const sections = [
    {
      title: "File Information",
      icon: <FileVideo className="w-4 h-4 text-primary" />,
      items: [
        { label: "Filename", value: data.filename },
        { label: "Container", value: data.containerFormat },
        { label: "Size", value: formatFilesize(data.filesize) },
        { label: "Created", value: data.creationTime },
      ]
    },
    {
      title: "Video Stream",
      icon: <Film className="w-4 h-4 text-primary" />,
      items: [
        { label: "Resolution", value: data.resolution },
        { label: "Codec", value: data.videoCodec },
        { label: "Frame Rate", value: data.frameRate },
        { label: "Duration", value: data.duration },
      ]
    },
    {
      title: "Audio Stream",
      icon: <Music className="w-4 h-4 text-primary" />,
      items: [
        { label: "Codec", value: data.audioCodec },
        { label: "Bitrate", value: data.bitrate },
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {isFallback && (
        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded">
          <Info className="w-4 h-4 inline mr-2" />
          <p>Some metadata unavailable. Using browser API fallback.</p>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        {sections.map((section, idx) => (
          <Card key={idx}>
            <CardHeader>
              {section.icon} {section.title}
            </CardHeader>
            <CardContent>
              {section.items.map((item, i) => (
                <div key={i} className="mb-3">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="text-sm font-mono">{item.value}</dd>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}