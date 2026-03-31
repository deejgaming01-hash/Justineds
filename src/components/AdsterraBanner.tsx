import { useEffect, useRef } from 'react';

interface AdsterraBannerProps {
  adKey: string;
  height: number;
  width: number;
}

export function AdsterraBanner({ adKey, height, width }: AdsterraBannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent; }
          </style>
        </head>
        <body>
          <script type="text/javascript">
            atOptions = {
              'key' : '${adKey}',
              'format' : 'iframe',
              'height' : ${height},
              'width' : ${width},
              'params' : {}
            };
          </script>
          <script type="text/javascript" src="https://www.highperformanceformat.com/${adKey}/invoke.js"></script>
        </body>
      </html>
    `;

    iframeRef.current.srcdoc = html;
  }, [adKey, height, width]);

  return (
    <div className="flex justify-center items-center my-4 w-full overflow-hidden">
      <iframe 
        ref={iframeRef}
        width={width} 
        height={height} 
        frameBorder="0" 
        scrolling="no" 
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{ border: 'none', overflow: 'hidden', width: `${width}px`, height: `${height}px` }}
        title={`Adsterra Banner ${width}x${height}`}
      />
    </div>
  );
}
