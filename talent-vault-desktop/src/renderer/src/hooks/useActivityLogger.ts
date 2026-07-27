import { useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

// Strongly typed actions and entities prevent typos across your app
export type ActionType = 
  | 'MOVE_STAGE' 
  | 'ADD_FEEDBACK' 
  | 'SEND_EMAIL' 
  | 'CREATE_JOB' 
  | 'UPDATE_CANDIDATE'
  | 'REJECT_CANDIDATE'
  | 'BULK_ADVANCE'    // 🚀 Added to support your bulk actions
  | 'BULK_REJECT'     // 🚀 Added to support your bulk actions
  | 'BULK_ARCHIVE';   // 🚀 Added to support your bulk actions

export type EntityType = 'Candidate' | 'Job' | 'System';

export function useActivityLogger() {
  const { userProfile, user } = useAuth();

  const logActivity = useCallback(async (
    action: ActionType,
    entity: EntityType,
    entityId: string,
    metadata: Record<string, any> = {}
  ) => {
    // 🚀 DEBUG CHECK 1: Verifies the button actually triggered the function
    console.log(`📝 Activity Logger: Attempting to log [${action}] on [${entity}]...`);

    // Safety check: Ensure the user is fully loaded and belongs to a company
    if (!userProfile?.company_id || !user?.id) {
      console.warn("⚠️ Activity Logger: Missing user or company context. Cannot log.");
      return;
    }

    try {
      const { error } = await supabase
        .from('activity_logs')
        .insert([{
          company_id: userProfile.company_id,
          user_id: user.id,
          user_email: user.email, // 🚀 Saves the actual email so the UI can display their name/initials!
          action,
          entity,
          entity_id: entityId,
          metadata
        }]);

      if (error) {
        throw error;
      } else {
        // 🚀 DEBUG CHECK 2: Verifies it was successfully saved to Supabase
        console.log(`✅ Activity Logger: Successfully logged [${action}]!`);
      }
    } catch (err) {
      console.error("❌ Activity Logger: Failed to save to database:", err);
    }
  }, [userProfile, user]); // 🚀 Dependencies ensure this function uses the latest auth state

  return { logActivity };
}