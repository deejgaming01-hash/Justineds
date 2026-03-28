import React, { useState } from 'react';
import { supabase, getSignedUrl } from '../supabase';
import { Upload, X, Loader2 } from 'lucide-react';

interface FileUploadProps {
  path: string; // e.g., 'avatars/user123/'
  bucket?: string;
  onUploadComplete: (storagePath: string, signedUrl: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ path, bucket = 'Jollideej', onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const uuid = Math.random().toString(36).substring(2);
      const fullPath = `${path}${uuid}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fullPath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;

      const signedUrl = await getSignedUrl(bucket, fullPath);
      if (signedUrl) {
        onUploadComplete(fullPath, signedUrl);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-cyber-blue text-black rounded-lg hover:bg-cyber-blue/80 transition-colors font-bold text-sm">
        {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
        {uploading ? "Uploading..." : "Upload"}
        <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} accept="image/*" />
      </label>
    </div>
  );
};
