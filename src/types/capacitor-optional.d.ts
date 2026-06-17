declare module "@capacitor/push-notifications" {
  export const PushNotifications: {
    requestPermissions(): Promise<{ receive: "granted" | "denied" | "prompt" }>;
    register(): Promise<void>;
  };
}

declare module "@capacitor/camera" {
  export const Camera: {
    getPhoto(options: Record<string, unknown>): Promise<{ base64String?: string }>;
  };
}

declare module "capacitor-native-biometric" {
  export const NativeBiometric: {
    isAvailable(): Promise<boolean>;
    verifyIdentity(options: Record<string, unknown>): Promise<void>;
  };
}

declare module "@capacitor/share" {
  export const Share: {
    share(options: { title: string; text: string; url?: string }): Promise<void>;
  };
}
