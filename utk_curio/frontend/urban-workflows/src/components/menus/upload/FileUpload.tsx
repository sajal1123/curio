import React, { useRef, useState, useEffect } from 'react';
import styles from './FileUpload.module.css';
import clsx from 'clsx';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileArrowUp, faXmark, faCheck } from "@fortawesome/free-solid-svg-icons";

const FileUpload = ({  }) => {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', file.name);

    setUploadStatus('uploading');

    try {
      const res = await fetch(`${process.env.BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      await res.text();
      setUploadStatus('success');
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus('error');
    }
  };

  // Reset status after a few seconds
  useEffect(() => {
    if (uploadStatus === 'success' || uploadStatus === 'error') {
      const timeout = setTimeout(() => setUploadStatus('idle'), 2000);
      return () => clearTimeout(timeout);
    }
  }, [uploadStatus]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={uploadStatus === 'uploading'}
      />

      <button
        className={styles.icon}
        type="button"
        onClick={handleFileClick}
        disabled={uploadStatus === 'uploading'}
      >
        {uploadStatus === 'uploading' ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            {' '}
          </>
        ) : uploadStatus === 'success' ? (
          <FontAwesomeIcon icon={faCheck} />
        ) : uploadStatus === 'error' ? (
          <FontAwesomeIcon icon={faXmark} />
        ) : (
          <FontAwesomeIcon icon={faFileArrowUp} />
        )}
      </button>
    </>
  );
};

export default FileUpload;
