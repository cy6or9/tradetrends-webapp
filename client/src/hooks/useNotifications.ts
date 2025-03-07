import { useState, useEffect } from 'react';

export function useNotifications() {
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    // Check if the browser supports notifications
    if (!("Notification" in window)) {
      console.warn("This browser does not support desktop notifications");
      return;
    }

    // Check if we already have permission
    if (Notification.permission === "granted") {
      setPermissionGranted(true);
    }
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === "granted";
      setPermissionGranted(granted);
      return granted;
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  };

  const sendNotification = (title: string, options?: NotificationOptions) => {
    if (!permissionGranted) {
      console.warn("Notification permission not granted");
      return;
    }

    try {
      new Notification(title, options);
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  };

  return {
    permissionGranted,
    requestPermission,
    sendNotification
  };
}
