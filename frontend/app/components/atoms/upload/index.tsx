import styles from "../../../../styles/UploadPandaDocs.module.scss"
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface UploadProps {
  onFileSelect: (file: File | null, hasError: boolean) => void;
  onErrorChange?: (hasError: boolean) => void;
}

const UploadPandaDocs: React.FC<UploadProps> = ({ onFileSelect, onErrorChange }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadCompleted, setUploadCompleted] = useState(false);

  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  
  // Reference to the file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Report error state to parent when it changes
  useEffect(() => {
    if (hasInteracted && onErrorChange) {
      onErrorChange(inputError !== null);
    }
  }, [inputError, hasInteracted, onErrorChange]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    setHasInteracted(true);
    setIsFocused(true);
    event.preventDefault();
    setDragActive(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      setInputError(null);
      const file = files[0];
      setSelectedFile(file);
      onFileSelect(file, false); // No error
      uploadFile(file);
    } else {
      setInputError("Please upload a file");
      onFileSelect(null, true); // Error
    }
  }, [onFileSelect]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setHasInteracted(true);
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    
    if (file) {
      uploadFile(file);
      setInputError(null);
      onFileSelect(file, false); // No error
    } else {
      setInputError("Please upload a file");
      onFileSelect(null, true); // Error
    }
  };

  const uploadFile = (file: File) => {
    setUploadProgress(0);
    setUploadCompleted(false);

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.floor((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    reader.onloadend = () => {
      setUploadCompleted(true);
      setTimeout(() => setUploadProgress(null), 500);
    };

    reader.readAsArrayBuffer(file);
  };

  const removeFile = () => {
    setHasInteracted(true);
    setSelectedFile(null);
    setUploadProgress(null);
    setUploadCompleted(false);
    setInputError("Please upload a file");
    onFileSelect(null, true); // Error
  };
  
  // Simplified upload click handler - directly sets the error
  const handleUploadClick = () => {
    setHasInteracted(true);
    setIsFocused(true);
    if (!selectedFile) {
      setInputError("Please upload a file");
      onFileSelect(null, true); // Error
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setHasInteracted(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  return (
    <div>
      <h3 className={styles.uploadLabel}>Upload PandaDocs Form</h3>
      <div
        className={`${styles.uploaddroparea} ${
          dragActive ? styles.dragActive : ""
        } ${inputError ? styles.uploadError : ""} ${
          selectedFile ? styles.uploaded : ""
        }`}
      >
        {selectedFile ? (
          <div className={styles.uploadfileinfo}>
            <div className={styles.uploadfileinfo}>
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5z" /></svg>
              <div>
                <p className={styles.filename}>{selectedFile.name}</p>
                <p className={styles.filesize}>{(selectedFile.size / (1024 * 1024)).toFixed(1)}MB</p>
              </div>
              <p className={styles.cancelupload} onClick={removeFile}>✕</p>
            </div>
            {uploadProgress !== null && (
              <div className={styles.progressbarcontainer}>
                <div
                  className={styles.progressbar}
                  style={{ width: `${uploadProgress}%` }}
                />
                <p className={styles.progresspercentage}>{uploadProgress}%</p>
              </div>
            )}
          </div>
        ) : (
          <label
            htmlFor="file-upload"
            className={styles.uploadbutton}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleUploadClick}
          >
            <div className={styles.uploadplaceholder}>
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-.5 14v3h-3v-3H8l4-4l4 4zM13 9V3.5L18.5 9z" /></svg>
              <input
                id="file-upload"
                type="file"
                className={styles.fileinput}
                onChange={handleFileChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                ref={fileInputRef}
              />
              <p><span className={styles.underline}>Click to upload</span> or drag and drop</p>
            </div>
          </label>
        )}
      </div>
      {inputError && <div className={styles.uploadErrorMessage}>{inputError}</div>}
    </div>
  );
};

export default UploadPandaDocs;
