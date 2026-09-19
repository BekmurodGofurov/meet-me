import { useEffect, useRef } from 'react';

export default function VideoTile() {
  // 1. Reference to the actual <video> DOM element
  const videoRef = useRef(null);

  // 2. Call getUserMedia once when the component first renders
  useEffect(() => {
    let currentStream = null;

    const startMedia = async () => {
      try {
        // 3. Request camera/mic and assign to srcObject
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        currentStream = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        // 5. Handle the rejection case
        console.error("Failed to get local media. Did you deny permissions?", err);
      }
    };

    startMedia();

    // 6. Clean up when the component unmounts
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Empty dependency array ensures this runs once on mount

  return (
    // 4. The <video> tag with the three required attributes
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{ width: '100%', maxWidth: '600px', backgroundColor: '#222', borderRadius: '8px' }}
    />
  );
}