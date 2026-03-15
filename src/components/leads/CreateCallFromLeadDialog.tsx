import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";

interface CreateCallFromLeadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadEmail: string;
  leadName?: string | null;
}

export function CreateCallFromLeadDialog({
  open,
  onOpenChange,
  leadEmail,
  leadName,
}: CreateCallFromLeadDialogProps) {
  const qc = useQueryClient();
  const googleAuth = useGoogleAuth();

  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [meetLink, setMeetLink] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime("10:00");
    setMeetLink("");
    setNotes("");
  };

  const handleOpenChange = (v: boolean) => {
    if (v) resetForm();
    onOpenChange(v);
  };

  const createCall = useMutation({
    mutationFn: async () => {
      const startAt = new Date(`${date}T${time}:00`);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: callData, error } = await supabase
        .from("calls")
        .insert({
          lead_email: leadEmail,
          start_at: startAt.toISOString(),
          meet_link: meetLink || null,
          notes: notes || null,
          owner_user_id: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Google Calendar integration
      if (googleAuth.isConnected && callData) {
        try {
          const result = await googleAuth.createCalendarEvent({
            title: `Call com ${leadName || leadEmail.split("@")[0]}`,
            start: startAt.toISOString(),
            type: "call",
          });
          if (result?.meetLink || result?.eventId) {
            await supabase.from("calls").update({
              meet_link: result.meetLink || callData.meet_link,
              google_event_id: result.eventId,
            }).eq("id", callData.id);
            // Show generated meet link
            if (result.meetLink) setMeetLink(result.meetLink);
          }
        } catch (e) {
          console.error("Google Calendar sync failed:", e);
        }
      }

      return callData;
    },
    onSuccess: (callData) => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      toast.success("Call agendada!", {
        description: meetLink ? `Link: ${meetLink}` : undefined,
      });
      handleOpenChange(false);
    },
    onError: (err: any) => toast.error("Erro ao criar call: " + err.message),
  });

  const displayName = leadName || leadEmail.split("@")[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            Nova Call
          </DialogTitle>
          <DialogDescription>
            Agende uma call com {displayName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Lead info (read-only) */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Lead</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/50 border border-border">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                {leadName && <p className="text-sm font-medium truncate">{leadName}</p>}
                <p className="text-xs text-muted-foreground truncate">{leadEmail}</p>
              </div>
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Horário</label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Meet link */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Link do Meet{" "}
              <span className="text-[10px]">(opcional — gerado automaticamente se conectado ao Google)</span>
            </label>
            <Input
              placeholder="https://meet.google.com/..."
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notas (opcional)</label>
            <Textarea
              rows={2}
              placeholder="Observações sobre a call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createCall.mutate()}
            disabled={!date || createCall.isPending}
          >
            {createCall.isPending ? "Agendando..." : "Agendar Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
