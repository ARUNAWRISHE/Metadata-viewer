export default function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center space-x-8">
          <img 
            src="/ips-DB-hB2tl.webp" 
            alt="IPS Database" 
            className="h-12 w-auto object-contain"
          />
          <img 
            src="/kite-logo-C9Mih3XS.png" 
            alt="Kite Logo" 
            className="h-12 w-auto object-contain"
          />
        </div>
        <p className="text-center text-muted-foreground text-sm mt-4">
          © 2024 Metadata Viewer. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
