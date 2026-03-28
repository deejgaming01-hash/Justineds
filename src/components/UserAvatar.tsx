import React, { useState, useEffect } from 'react';
import { getSignedUrl } from '../supabase';

interface UserAvatarProps {
  user: {
    profilePic?: string;
    uid?: string;
  };
  className?: string;
  size?: number;
}

const STORAGE_BUCKET = 'Jollideej';

export const UserAvatar: React.FC<UserAvatarProps> = ({ user, className, size = 40 }) => {
  const [url, setUrl] = useState<string>("https://cdn-icons-png.flaticon.com/512/847/847969.png");

  useEffect(() => {
    const fetchUrl = async () => {
      if (user.profilePic) {
        if (user.profilePic.startsWith('http')) {
          setUrl(user.profilePic);
        } else {
          // If it's not a URL, assume it's a storage path
          try {
            const signedUrl = await getSignedUrl(STORAGE_BUCKET, user.profilePic);
            if (signedUrl) setUrl(signedUrl);
          } catch (error) {
            console.error("Error fetching signed URL for avatar:", error);
          }
        }
      } else {
        setUrl("https://cdn-icons-png.flaticon.com/512/847/847969.png");
      }
    };

    fetchUrl();
  }, [user.profilePic]);

  return (
    <img 
      src={url} 
      alt="Avatar" 
      className={className} 
      style={{ objectFit: 'cover' }}
      referrerPolicy="no-referrer"
    />
  );
};
