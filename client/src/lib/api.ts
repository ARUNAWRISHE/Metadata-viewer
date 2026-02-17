import { analyzeVideo, type VideoMetadata } from './mediainfo';

export interface ApiResponse {
  success: boolean;
  metadata?: VideoMetadata;
  error?: string;
}

export interface ApiKey {
  id: string;
  key: string;
  createdAt: string;
  usageCount: number;
}

// Simulate API endpoint for video metadata extraction
export async function extractVideoMetadata(file: File, apiKey: string): Promise<ApiResponse> {
  try {
    // Validate API key (check localStorage for demo purposes)
    const storedKeys = localStorage.getItem('apiKeys');
    if (!storedKeys) {
      return { success: false, error: 'Invalid API key' };
    }
    
    const keys: ApiKey[] = JSON.parse(storedKeys);
    const validKey = keys.find(k => k.key === apiKey);
    
    if (!validKey) {
      return { success: false, error: 'Invalid API key' };
    }
    
    // Update usage count
    validKey.usageCount += 1;
    localStorage.setItem('apiKeys', JSON.stringify(keys));
    
    // Validate file type - be more permissive and check by extension too
    const supportedTypes = [
      'video/mp4', 'video/avi', 'video/mov', 'video/quicktime', 
      'video/wmv', 'video/flv', 'video/webm', 'video/mkv',
      'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv'
    ];
    
    // Also check by file extension if MIME type is generic
    const extension = file.name.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'm4v'];
    
    if (!supportedTypes.includes(file.type) && (!extension || !supportedExtensions.includes(extension))) {
      return { success: false, error: `Unsupported file format: ${file.type || 'unknown'}. Supported formats: ${supportedExtensions.join(', ')}` };
    }
    
    // Extract metadata using existing mediainfo function
    const metadata = await analyzeVideo(file);
    
    return { success: true, metadata };
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: 'Failed to extract metadata' };
  }
}

// Mock API endpoint that would be called from external applications
export function createApiEndpoint() {
  // This would be implemented in a backend server
  // For now, we're simulating the API behavior in the client
  console.log('API endpoint would be available at: /api/extract-metadata');
}
