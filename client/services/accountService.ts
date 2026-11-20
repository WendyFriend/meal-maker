import { supabase } from '../lib/supabase';

/**
 * Deletes the signed-in user's account and everything they saved
 * (`delete_my_account` in supabase/migrations), then ends the session.
 */
export async function deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    // The account is gone; clear the local session without a server call.
    await supabase.auth.signOut({ scope: 'local' });
}
