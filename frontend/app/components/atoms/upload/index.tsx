import styles from "../../../../styles/UploadPandaDocs.module.scss"
import React, { useState, useCallback } from 'react';

interface UploadProps {
  onFileSelect: (file: File | null) => void;
}

const UploadPandaDocs: React.FC<UploadProps> = ({ onFileSelect }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    onFileSelect(file);
  };

  return (
    <div className={styles.uploadwrapper}>
      <label
        htmlFor="file-upload"
        className={`${styles.uploaddroparea} ${dragActive ? styles.dragactive : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <div className={styles.uploadfileinfo}>
            <p>{selectedFile.name}</p>
          </div>
        ) : (
          <div className={styles.uploadplaceholder}>
            <label htmlFor="file-upload" className={styles.uploadbutton}>
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-.5 14v3h-3v-3H8l4-4l4 4zM13 9V3.5L18.5 9z"/></svg>
            </label>
            <input
              id="file-upload"
              type="file"
              className={styles.fileinput}
              onChange={handleFileChange}
            />
            <p><span className={styles.underline}>Click to upload</span> or drag and drop</p>
          </div>
        )}
      </label>
    </div>
  );
};

export default UploadPandaDocs;
