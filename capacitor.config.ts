import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.callumalpass.pickle",
  appName: "Pickle",
  webDir: "dist",
  backgroundColor: "#fbfcfe",
  server: {
    hostname: "pickle.mdbase.dev",
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#fbfcfe",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["alert", "sound"],
    },
  },
};

export default config;
