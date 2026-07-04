declare module "@capacitor/push-notifications" {
  export const PushNotifications: {
    requestPermissions(): Promise<{ receive: "granted" | "denied" | "prompt" }>;
    register(): Promise<void>;
    addListener(
      eventName: string,
      handler: (event: Record<string, unknown>) => void
    ): Promise<void>;
    removeListener(eventName: string, handler: (event: unknown) => void): Promise<void>;
    removeAllListeners(): Promise<void>;
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

declare module "@capacitor/app" {
  export const App: {
    addListener(eventName: string, handler: (event: { canGoBack: boolean }) => void): Promise<void>;
    removeAllListeners(): Promise<void>;
    exitApp(): void;
  };
}
