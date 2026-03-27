import React, { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { Upload, X, Loader2 } from 'lucide-react';

interface FileUploadProps {
  path: string; // e.g., 'uploads/user123/'
  onUploadComplete: (url: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ path, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `${path}${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onUploadComplete(url);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-cyber-blue text-black rounded-lg hover:bg-cyber-blue/80 transition-colors">
        {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
        {uploading ? "Uploading..." : "Upload File"}
        <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
      </label>
    </div>
  );
};
