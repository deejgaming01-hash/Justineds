import React, { useEffect } from 'react';

interface AdBannerProps {
  dataAdSlot: string;
  dataAdFormat?: string;
  dataFullWidthResponsive?: boolean;
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ 
  dataAdSlot, 
  dataAdFormat = 'auto', 
  dataFullWidthResponsive = true,
  className = ''
}) => {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, []);

  return (
    <div className={`w-full overflow-hidden flex justify-center ${className}`}>
      <ins className="adsbygoogle"
           style={{ display: 'block', width: '100%' }}
           data-ad-client="ca-pub-7898100148464681"
           data-ad-slot={dataAdSlot}
           data-ad-format={dataAdFormat}
           data-full-width-responsive={dataFullWidthResponsive.toString()}></ins>
    </div>
  );
};
