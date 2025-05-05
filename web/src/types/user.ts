export type User = {
  username: string;
  email?: string; // Add email field, making it optional if necessary
  receive_alert: boolean; // Ensure receive_alert is boolean
};
