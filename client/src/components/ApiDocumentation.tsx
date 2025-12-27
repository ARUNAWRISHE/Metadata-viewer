import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, Terminal, Globe } from 'lucide-react';

export default function ApiDocumentation() {
  const baseUrl = window.location.origin;
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            API Documentation
          </CardTitle>
          <CardDescription>
            Learn how to integrate video metadata extraction into your applications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Base URL</h3>
            <code className="bg-muted px-2 py-1 rounded text-sm">{baseUrl}/api</code>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Authentication</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Include your API key in the X-API-Key header:
            </p>
            <div className="bg-muted p-3 rounded">
              <code className="text-sm">X-API-Key: mv_1234567890_abcdefg</code>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Endpoints
            </h3>
            
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">POST /api/extract-metadata</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload a video file and extract its metadata
                </p>
                
                <div className="space-y-2">
                  <div>
                    <h5 className="font-medium text-sm">Request:</h5>
                    <div className="bg-muted p-3 rounded mt-1">
                      <pre className="text-xs overflow-x-auto">
{`Content-Type: multipart/form-data
X-API-Key: your_api_key_here

Body:
- video: (file) - The video file to analyze`}
                      </pre>
                    </div>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-sm">Response:</h5>
                    <div className="bg-muted p-3 rounded mt-1">
                      <pre className="text-xs overflow-x-auto">
{`{
  "success": true,
  "metadata": {
    "format": {
      "formatName": "MPEG-4",
      "duration": "120.5",
      "fileSize": "15728640"
    },
    "video": [{
      "width": 1920,
      "height": 1080,
      "frameRate": "30.000",
      "bitRate": "5000000"
    }],
    "audio": [{
      "channels": 2,
      "samplingRate": "48000",
      "bitRate": "128000"
    }]
  }
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Code className="w-4 h-4" />
              Code Examples
            </h3>
            
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">JavaScript/Node.js</h4>
                <div className="bg-muted p-3 rounded">
                  <pre className="text-xs overflow-x-auto">
{`const formData = new FormData();
formData.append('video', videoFile);

fetch('${baseUrl}/api/extract-metadata', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your_api_key_here'
  },
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('Metadata:', data.metadata);
})
.catch(error => console.error('Error:', error));`}
                  </pre>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">Python</h4>
                <div className="bg-muted p-3 rounded">
                  <pre className="text-xs overflow-x-auto">
{`import requests

with open('video.mp4', 'rb') as f:
    files = {'video': f}
    headers = {'X-API-Key': 'your_api_key_here'}
    
    response = requests.post(
        '${baseUrl}/api/extract-metadata',
        files=files,
        headers=headers
    )
    
    if response.status_code == 200:
        metadata = response.json()['metadata']
        print('Metadata:', metadata)
    else:
        print('Error:', response.status_code)`}
                  </pre>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">cURL</h4>
                <div className="bg-muted p-3 rounded">
                  <pre className="text-xs overflow-x-auto">
{`curl -X POST \\
  '${baseUrl}/api/extract-metadata' \\
  -H 'X-API-Key: your_api_key_here' \\
  -F 'video=@video.mp4'`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Error Responses</h3>
            <div className="bg-muted p-3 rounded">
              <pre className="text-xs overflow-x-auto">
{`{
  "success": false,
  "error": "Invalid API key"
}

{
  "success": false,
  "error": "No video file provided"
}

{
  "success": false,
  "error": "Unsupported file format"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
