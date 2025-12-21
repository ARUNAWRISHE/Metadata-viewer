import MediaInfoFactory from 'mediainfo.js';
import type { MediaInfo } from 'mediainfo.js';

export interface VideoMetadata {
  filename: string;
  filesize: number;
  mimeType: string;
  duration: string;
  resolution: string;
  frameRate: string;
  videoCodec: string;
  audioCodec: string;
  bitrate: string;
  creationTime: string;
  containerFormat: string;
  source: 'mediainfo' | 'browser-api' | 'fallback';
}

const CDN_WASM_URL = 'https://unpkg.com/mediainfo.js@0.3.3/dist/MediaInfoModule.wasm';

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}mn`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

async function getBasicVideoMetadata(file: File): Promise<Partial<VideoMetadata>> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      resolve({});
    }, 5000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      resolve({
        duration: formatDuration(video.duration),
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        containerFormat: file.type.split('/')[1]?.toUpperCase(),
      });
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      resolve({});
    };

    video.src = URL.createObjectURL(file);
  });
}

export async function analyzeVideo(file: File): Promise<VideoMetadata> {
  const baseMetadata: VideoMetadata = {
    filename: file.name,
    filesize: file.size,
    mimeType: file.type || 'Unknown',
    duration: 'Unknown',
    resolution: 'Unknown',
    frameRate: 'Unknown',
    videoCodec: 'Unknown',
    audioCodec: 'Unknown',
    bitrate: 'Unknown',
    creationTime: new Date(file.lastModified).toLocaleString(),
    containerFormat: 'Unknown',
    source: 'fallback'
  };

  try {
    let mediainfo: MediaInfo | null = null;
    try {
      mediainfo = await MediaInfoFactory({
        locateFile: () => CDN_WASM_URL,
      });

      if (mediainfo) {
        const result = await mediainfo.analyzeData(
          () => file.size,
          async (chunkSize, offset) => {
            const chunk = file.slice(offset, offset + chunkSize);
            const buffer = await chunk.arrayBuffer();
            return new Uint8Array(buffer);
          }
        );

        const general = result.media?.track?.find(t => t['@type'] === 'General');
        const video = result.media?.track?.find(t => t['@type'] === 'Video');
        const audio = result.media?.track?.find(t => t['@type'] === 'Audio');

        if (general || video) {
          mediainfo.close();
          return {
            ...baseMetadata,
            duration: general?.Duration_String3 || baseMetadata.duration,
            resolution: `${video?.Width}x${video?.Height}` || baseMetadata.resolution,
            frameRate: video?.FrameRate ? `${video.FrameRate} fps` : baseMetadata.frameRate,
            videoCodec: video?.Format || baseMetadata.videoCodec,
            audioCodec: audio?.Format || 'None',
            bitrate: general?.OverallBitRate_String || baseMetadata.bitrate,
            containerFormat: general?.Format || baseMetadata.containerFormat,
            source: 'mediainfo'
          };
        }
      }
    } catch (e) {
      console.warn('MediaInfo failed, using browser API');
    } finally {
      if (mediainfo) mediainfo.close();
    }

    const basicData = await getBasicVideoMetadata(file);
    return {
      ...baseMetadata,
      ...basicData,
      duration: basicData.duration ?? baseMetadata.duration,
      resolution: basicData.resolution ?? baseMetadata.resolution,
      containerFormat: basicData.containerFormat ?? baseMetadata.containerFormat,
      source: 'browser-api',
    };
  } catch (error) {
    return baseMetadata;
  }
}