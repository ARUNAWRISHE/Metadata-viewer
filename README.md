# MetaView - Video Metadata Inspector & API Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MetaView is a modern web application that allows you to analyze video files and extract detailed metadata. It provides both a user-friendly web interface and a powerful API for programmatic access to video metadata analysis.

## Features

- **Video Metadata Analysis**: Upload and analyze video files to extract detailed technical metadata
- **API Access**: Generate API keys and access video analysis programmatically
- **Interactive API Tester**: Test API endpoints directly from the web interface
- **Comprehensive Documentation**: Built-in API documentation for easy integration
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: Radix UI, Tailwind CSS
- **State Management**: React Query
- **API**: Custom video analysis API
- **Build Tools**: Vite, TypeScript

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- Modern web browser (Chrome, Firefox, Safari, or Edge)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/metadata-viewer.git
   cd metadata-viewer
   ```

2. Install dependencies:
   ```bash
   cd client
   npm install
   ```

### Running Locally

1. Start the development server:
   ```bash
   cd client
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Analyze a Video**
   - Click on the "Analyze Video" tab
   - Drag and drop a video file or click to browse
   - View the detailed metadata analysis

2. **API Access**
   - Navigate to the "API Keys" tab to generate an API key
   - Use the "API Tester" to test API endpoints
   - Check the "API Docs" for detailed endpoint documentation

## API Documentation

The API documentation is available within the application under the "API Docs" tab. It includes:

- Authentication methods
- Available endpoints
- Request/response formats
- Error handling
- Rate limiting information

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [React](https://reactjs.org/) and [Vite](https://vitejs.dev/)
- UI components powered by [Radix UI](https://www.radix-ui.com/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Video analysis powered by [mediainfo.js](https://github.com/buzz/mediainfo.js/)

## Support

For support, please open an issue on the GitHub repository.
