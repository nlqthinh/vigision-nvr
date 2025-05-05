import { useCallback, useEffect, useState } from "react";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import { VigisionConfig } from "@/types/vigisionConfig";
import { Toaster } from "@/components/ui/sonner";
import useSWR from "swr";
import Heading from "@/components/ui/heading";
import { User } from "@/types/user";
import { Button } from "@/components/ui/button";
import SetPasswordDialog from "@/components/overlay/SetPasswordDialog";
import axios from "axios";
import CreateUserDialog from "@/components/overlay/CreateUserDialog";
import { toast } from "sonner";
import DeleteUserDialog from "@/components/overlay/DeleteUserDialog";
import { Card } from "@/components/ui/card";
import { HiTrash } from "react-icons/hi";
import { FaUserEdit } from "react-icons/fa";
import { LuPlus } from "react-icons/lu";
import SetEmailDialog from "@/components/overlay/SetEmailDialog";

const fetcher = (url: string) => axios.get(url).then(res => res.data);

export default function AuthenticationView() {
  const { data: config } = useSWR<VigisionConfig>("config", fetcher);
  const { data: users, mutate: mutateUsers } = useSWR<User[]>("users", fetcher);
  const { data: profile, error: profileError } = useSWR("/profile", fetcher);

  const [showSetPassword, setShowSetPassword] = useState(false);
  const [showSetEmail, setShowSetEmail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>();
  const [currentEmail, setCurrentEmail] = useState<string>("");

  const loggedInUsername = profile?.username || null;

  useEffect(() => {
    document.title = "Authentication Settings - Vigision";
  }, []);

  const onSavePassword = useCallback((user: string, password: string) => {
    axios
      .put(`users/${user}/password`, {
        password: password,
      })
      .then((response) => {
        if (response.status === 200) {
          setShowSetPassword(false);
        }
      })
      .catch((_error) => {
        toast.error("Error setting password", {
          position: "top-center",
        });
      });
  }, []);

  const onSaveEmail = useCallback(
    async (user: string, email: string, otp: string, resetForm: () => void) => {
      try {
        const updatedUsers = users?.map((u) =>
          u.username === user ? { ...u, email } : u
        );
        mutateUsers(updatedUsers, false);

        const response = await axios.put(`users/${user}/email`, {
          email: email,
          otp: otp,
        });
        if (response.status === 200) {
          toast.success("Email updated successfully.", {
            position: "top-center",
          });
          await mutateUsers();
          setShowSetEmail(false);
          resetForm();
        } else {
          toast.error("Invalid OTP", {
            position: "top-center",
          });
        }
      } catch (error) {
        await mutateUsers();
        toast.error("Invalid OTP", {
          position: "top-center",
        });
      }
    },
    [users, mutateUsers]
  );

  const onCreate = async (user: string, password: string, email: string, otp: string, resetForm: () => void) => {
    try {
      const response = await axios.post("users", {
        username: user,
        password: password,
        email: email,
        otp: otp,
      });
      if (response.status === 201) {
        setShowCreate(false);
        await mutateUsers();
        toast.success("Created successfully.", {
          position: "top-center",
        });
        resetForm();
      }
    } catch (error) {
      console.error("Error creating user:", error);
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error("Error response:", error.response);
          const errorMessage = error.response.data?.message || error.response.data?.error;
          if (error.response.status === 500) {
            toast.error("Username exists, creation failed.", {
              position: "top-center",
            });
          } else if (error.response.status === 400 && errorMessage.includes("exists")) {
            toast.error(errorMessage, {
              position: "top-center",
            });
          } else {
            toast.error(errorMessage || "Error creating user. Check server logs.", {
              position: "top-center",
            });
          }
        } else {
          toast.error("No response received. Check server logs.", {
            position: "top-center",
          });
        }
      } else {
        toast.error("Unexpected error. Check server logs.", {
          position: "top-center",
        });
      }
    }
  };

  const onDelete = async (user: string) => {
    try {
      await axios.delete(`users/${user}`);
      setShowDelete(false);
      await mutateUsers();
      toast.success("Deleted successfully", {
        position: "top-center",
      });
    } catch (error) {
      toast.error("Error deleting user. Check server logs.", {
        position: "top-center",
      });
    }
  };

  const onToggleReceiveAlert = async (user: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      console.log(`Sending request to update receive alert for user ${user} to ${newStatus}`);
      await axios.put(`users/${user}/receive-alert`, {
        receive_alert: newStatus,
      });
      await mutateUsers();
      toast.success("Receive alert updated successfully.", {
        position: "top-center",
      });
    } catch (error) {
      console.error(`Error updating receive alert for user ${user}:`, error);
      toast.error("Error updating receive alert. Check server logs.", {
        position: "top-center",
      });
    }
  };

  if (!config || !users) {
    return <ActivityIndicator />;
  }

  const sortedUsers = users.slice().sort((a, b) => {
    if (a.username === "admin") return -1;
    if (b.username === "admin") return 1;
    return a.username.localeCompare(b.username);
  });

  const filteredUsers = loggedInUsername === "admin" ? sortedUsers : sortedUsers?.filter((u) => u.username === loggedInUsername);

  return (
    <div className="flex size-full flex-col md:flex-row">
      <Toaster position="top-center" closeButton={true} />
      <div className="scrollbar-container order-last mb-10 mt-2 flex h-full w-full flex-col overflow-y-auto rounded-lg border-[1px] border-secondary-foreground bg-background_alt p-2 md:order-none md:mb-0 md:mr-2 md:mt-0">
        <div className="flex flex-row items-center justify-between gap-2">
          <Heading as="h3" className="my-2">
            Users
          </Heading>
          {loggedInUsername === "admin" && (
            <Button
              className="flex items-center gap-1"
              variant="default"
              onClick={() => {
                setShowCreate(true);
              }}
            >
              <LuPlus className="text-secondary-foreground" />
              Add User
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-3">
          {filteredUsers?.map((u) => (
            <Card key={u.username} className="mb-1 p-2">
              <div className="flex items-center gap-3">
                <div className="ml-3 flex flex-none shrink overflow-hidden text-ellipsis align-middle text-lg">
                  {u.username}
                </div>
                <div className="ml-3 flex flex-none shrink overflow-hidden text-ellipsis align-middle text-lg text-gray-500">
                  {u.email || "No email provided"}
                </div>
                <div className="flex flex-1 justify-end space-x-2">
                  <Button
                    className="flex items-center gap-1"
                    variant="secondary"
                    onClick={() => {
                      setShowSetPassword(true);
                      setSelectedUser(u.username);
                    }}
                  >
                    <FaUserEdit />
                    <div className="hidden md:block">Update Password</div>
                  </Button>
                  <Button
                    className="flex items-center gap-1"
                    variant="secondary"
                    onClick={() => {
                      setShowSetEmail(true);
                      setSelectedUser(u.username);
                      setCurrentEmail(u.email || "");
                    }}
                  >
                    <FaUserEdit />
                    <div className="hidden md:block">Update Email</div>
                  </Button>
                  <Button
                    className="flex items-center gap-1"
                    variant={u.receive_alert ? "secondary" : "outline"}
                    onClick={() => onToggleReceiveAlert(u.username, u.receive_alert)}
                    disabled={!u.email}
                  >
                    {u.receive_alert ? "Receive alert: On" : "Receive alert: Off"}
                  </Button>
                  {loggedInUsername === "admin" && u.username !== "admin" && (
                    <Button
                      className="flex items-center gap-1"
                      variant="destructive"
                      onClick={() => {
                        setShowDelete(true);
                        setSelectedUser(u.username);
                      }}
                    >
                      <HiTrash />
                      <div className="hidden md:block">Delete</div>
                    </Button>
                  )}
                  {u.username === "admin" && (
                    <Button className="flex items-center gap-1" variant="destructive" disabled>
                      <HiTrash />
                      <div className="hidden md:block">Delete</div>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      {selectedUser && (
        <SetPasswordDialog
          show={showSetPassword}
          onCancel={() => {
            setShowSetPassword(false);
          }}
          onSave={(password) => {
            onSavePassword(selectedUser!, password);
          }}
          username={selectedUser!}
        />
      )}
      {selectedUser && (
        <SetEmailDialog
          show={showSetEmail}
          onCancel={() => {
            setShowSetEmail(false);
          }}
          onSave={(email, otp, resetForm) => {
            onSaveEmail(selectedUser!, email, otp, resetForm);
          }}
          username={selectedUser!}
          currentEmail={currentEmail}
        />
      )}
      <DeleteUserDialog
        show={showDelete}
        onCancel={() => {
          setShowDelete(false);
        }}
        onDelete={() => {
          onDelete(selectedUser!);
        }}
      />
      <CreateUserDialog
        show={showCreate}
        onCreate={onCreate}
        onCancel={() => {
          setShowCreate(false);
        }}
      />
    </div>
  );
}
