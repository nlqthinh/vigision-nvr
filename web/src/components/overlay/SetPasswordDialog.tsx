import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import axios from "axios";
import { toast } from "sonner";
import ActivityIndicator from "../indicators/activity-indicator";


type SetPasswordProps = {
  show: boolean;
  onSave: (newPassword: string) => void;
  onCancel: () => void;
  username: string;
};

export default function SetPasswordDialog({
  show,
  onSave,
  onCancel,
  username,
}: SetPasswordProps) {
  const [oldPassword, setOldPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState<boolean>(false);
  const [oldPasswordCorrect, setOldPasswordCorrect] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (oldPasswordCorrect) {
      validatePassword(newPassword, confirmPassword);
    }
  }, [newPassword, confirmPassword, oldPasswordCorrect]);

  useEffect(() => {
    if (!show) {
      resetState();
    }
  }, [show]);

  const resetState = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors([]);
    setIsValid(false);
    setOldPasswordCorrect(false);
    setIsLoading(false);
  };

  const validatePassword = (newPassword: string, confirmPassword: string) => {
    const newErrors: string[] = [];
    if (!newPassword) {
      newErrors.push("New password is required.");
    }
    if (!confirmPassword) {
      newErrors.push("Confirm new password is required.");
    }
    if (newPassword.length < 8) {
      newErrors.push("Password must be at least 8 characters long.");
    }
    if (!/\d/.test(newPassword)) {
      newErrors.push("Password must contain at least one number.");
    }
    // at least 1 uppercase letter
    if (!/[A-Z]/.test(newPassword)) {
      newErrors.push("Password must contain at least one uppercase letter.");
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      newErrors.push("Password must contain at least one special character.");
    }
    if (newPassword !== confirmPassword) {
      newErrors.push("Passwords do not match.");
    }
    setErrors(newErrors);
    setIsValid(newErrors.length === 0);
  };

  const handleOldPasswordCheck = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`/users/${username}/verify-password`, {
        password: oldPassword,
      });
      if (response.status === 200) {
        setOldPasswordCorrect(true);
        setErrors([]);
      } else {
        setErrors(["Old password is incorrect."]);
      }
    } catch (error) {
      setErrors(["Old password is incorrect."]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (isValid) {
      onSave(newPassword);
      toast.success("Password updated successfully.", {
        position: "top-center",
      });
      resetState();
      onCancel();
    }
  };

  return (
    <Dialog open={show} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Password</DialogTitle>
        </DialogHeader>
        {!oldPasswordCorrect ? (
          <>
            <label className="block text-sm font-medium text-gray-700">Old Password</label>
            <Input
              className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
            {errors.length > 0 && (
              <div className="text-red-600 mt-2">
                {errors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button
                className="flex items-center gap-1"
                variant="select"
                size="sm"
                onClick={handleOldPasswordCheck}
                disabled={isLoading || !oldPassword}
              >
                {isLoading && <ActivityIndicator className="mr-2 h-4 w-4" />}
                Verify Old Password
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <Input
              className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <Input
              className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {errors.length > 0 && (
              <div className="text-red-600 mt-2">
                {errors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button
                className="flex items-center gap-1"
                variant="select"
                size="sm"
                onClick={handleSave}
                disabled={!isValid}
              >
                Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}