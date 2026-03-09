

## Plan: Google Calendar per Assignee + Connection Status in Settings

### Current Problem
When a task is created/assigned, the calendar event goes to the **creator's** Google Calendar, not the assignee's.

### Changes

#### 1. Update `google-calendar-event` edge function
Accept optional `target_user_id` in the request body. If provided, use that user's Google tokens instead of the caller's. Falls back to caller's tokens if `target_user_id` is not set or has no Google connected. This keeps backward compatibility for calls.

#### 2. Update `useGoogleAuth.ts` — `createCalendarEvent`
Add optional `targetUserId` param that gets passed as `target_user_id` to the edge function.

#### 3. Update `useTasks.ts` — `useCreateTask` and `useUpdateTask`
After successfully creating/updating a task with `assigned_to` and `due_date`, call the calendar event edge function with `target_user_id: assigned_to`. Silently ignore failures (user may not have Google connected).

#### 4. Add Google Connection section in `Configuracoes.tsx`
New component `GoogleConnectionStatus` below TeamManagement. Shows each team member with their Google connection status (green dot = connected, gray = not). Each user sees their own connect/disconnect button. Uses existing `useGoogleAuth` hook for the current user's actions. Admin sees all members' statuses via a new lightweight edge function call or by extending `google-auth-status` to accept a `check_user_id` param (admin only).

Actually simpler: add a "Minha Conta" section visible to ALL users (not just admin) in Configuracoes where they can connect/disconnect their own Google. Admin section stays admin-only.

### Files
- **Edit**: `supabase/functions/google-calendar-event/index.ts` — add `target_user_id` logic
- **Edit**: `src/hooks/useGoogleAuth.ts` — add `targetUserId` to `createCalendarEvent`
- **Edit**: `src/hooks/useTasks.ts` — call calendar event on create/update with assignee
- **Edit**: `src/pages/Configuracoes.tsx` — add personal Google connection section for all users

