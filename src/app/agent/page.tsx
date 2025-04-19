"use client";
import { useState, useRef } from "react";

export default function Home() {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
  
    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
  
        audioChunksRef.current = [];
  
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
  
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          console.log('Finished recording, audioBlob:', audioBlob);
  
          await sendAudioBlob(audioBlob);
        };
  
        mediaRecorder.start();
        setIsRecording(true);
  
      } catch (err) {
        console.error('Error starting recording:', err);
      }
    };
  
    const stopRecording = () => {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    };
  
    const sendAudioBlob = async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
  
      const response = await fetch('/api/talk', {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        console.error('Failed to send audio');
        return;
      }
  
      console.log('Audio successfully sent!');
    };
  
    return (
      <div className="flex flex-col items-center">
        {isRecording ? (
          <button onClick={stopRecording} className="bg-red-500 p-2 rounded">
            Stop Recording
          </button>
        ) : (
          <button onClick={startRecording} className="bg-green-500 p-2 rounded">
            Start Recording
          </button>
        )}
      </div>
    );
  }