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

// Fallback WASM URLs in case the main one fails
const FALLBACK_WASM_URLS = [
  'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.3/dist/MediaInfoModule.wasm',
  'https://cdnjs.cloudflare.com/ajax/libs/mediainfo.js/0.3.3/MediaInfoModule.wasm'
];

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

  let mediainfo: MediaInfo | null = null;
  
  try {
    let wasmUrl = CDN_WASM_URL;
    
    // Try multiple WASM URLs if the first one fails
    for (let attempt = 0; attempt < FALLBACK_WASM_URLS.length + 1; attempt++) {
      try {
        if (attempt > 0) {
          wasmUrl = FALLBACK_WASM_URLS[attempt - 1];
          console.log(`Retrying MediaInfo with fallback URL: ${wasmUrl}`);
        }
        
        mediainfo = await MediaInfoFactory({
          locateFile: () => wasmUrl,
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
        break; // Success, exit the loop
      } catch (e) {
        console.warn(`MediaInfo attempt ${attempt + 1} failed:`, e);
        if (mediainfo) {
          try { mediainfo.close(); } catch {}
          mediainfo = null;
        }
        if (attempt === FALLBACK_WASM_URLS.length) {
          // All attempts failed, throw to trigger fallback
          throw e;
        }
      }
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
  } catch (e) {
    console.warn('MediaInfo failed completely, using browser API fallback:', e);
    const basicData = await getBasicVideoMetadata(file);
    return {
      ...baseMetadata,
      ...basicData,
      duration: basicData.duration ?? baseMetadata.duration,
      resolution: basicData.resolution ?? baseMetadata.resolution,
      containerFormat: basicData.containerFormat ?? baseMetadata.containerFormat,
      source: 'browser-api',
    };
  } finally {
    if (mediainfo) {
      try { mediainfo.close(); } catch {}
    }
  }
}