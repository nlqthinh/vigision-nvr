import { baseUrl } from "@/api/baseUrl";
import ExportCard from "@/components/card/ExportCard";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { DeleteClipType, Export } from "@/types/export";
import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuFolderX } from "react-icons/lu";
import { toast } from "sonner";
import useSWR from "swr";

function Exports() {
  const { data: exports, mutate } = useSWR<Export[]>("exports");

  useEffect(() => {
    document.title = "Export - Vigision";
  }, []);

  // Search

  const [search, setSearch] = useState("");

  const filteredExports = useMemo(() => {
    if (!search || !exports) {
      return exports;
    }

    return exports.filter((exp) =>
      exp.name
        .toLowerCase()
        .replaceAll("_", " ")
        .includes(search.toLowerCase()),
    );
  }, [exports, search]);

  // Deleting

  const [deleteClip, setDeleteClip] = useState<DeleteClipType | undefined>();

  const onHandleDelete = useCallback(() => {
    if (!deleteClip) {
      return;
    }

    axios.delete(`export/${deleteClip.file}`).then((response) => {
      if (response.status == 200) {
        setDeleteClip(undefined);
        mutate();
        toast.success("Successfully deleted export", { position: "top-center" });
      }
    });
  }, [deleteClip, mutate]);

  // Renaming

  const onHandleRename = useCallback(
    (id: string, update: string) => {
      axios.patch(`export/${id}/${update}`).then((response) => {
        if (response.status == 200) {
          setDeleteClip(undefined);
          mutate();
        }
      });
    },
    [mutate],
  );

  // Viewing

  const [selected, setSelected] = useState<Export>();

  return (
    <>
      <Toaster closeButton={true} />

      <div className="flex size-full flex-col gap-2 overflow-hidden px-1 pt-2 md:p-2">
        <AlertDialog
          open={deleteClip != undefined}
          onOpenChange={() => setDeleteClip(undefined)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Export</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {deleteClip?.exportName}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                className="text-white"
                variant="destructive"
                onClick={() => onHandleDelete()}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={selected != undefined}
          onOpenChange={(open) => {
            if (!open) {
              setSelected(undefined);
            }
          }}
        >
          <DialogContent className="max-w-7xl">
            <DialogTitle>{selected?.name}</DialogTitle>
            <video
              className="size-full rounded-lg md:rounded-2xl"
              playsInline
              preload="auto"
              autoPlay
              controls
              muted
            >
              <source
                src={`${baseUrl}${selected?.video_path?.replace("/media/vigision/", "")}`}
                type="video/mp4"
              />
            </video>
          </DialogContent>
        </Dialog>

        {exports && (
          <div className="flex w-full items-center justify-center p-2">
            <Input
              className="w-full bg-muted md:w-1/3"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        <div className="w-full overflow-hidden">
          {exports && filteredExports && filteredExports.length > 0 ? (
            <div className="scrollbar-container grid size-full gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Object.values(exports).map((item) => (
                <ExportCard
                  key={item.name}
                  className={
                    search == "" || filteredExports.includes(item) ? "" : "hidden"
                  }
                  exportedRecording={item}
                  onSelect={setSelected}
                  onRename={onHandleRename}
                  onDelete={({ file, exportName }) =>
                    setDeleteClip({ file, exportName })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
              <LuFolderX className="size-16" />
              No exports found
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Exports;
