// Chat-Display-Logik: Bei 2er-Chats den Namen der anderen Person anzeigen

export type ChatMember = {
  user_id: string
  display_name: string
}

export type ChatDisplayInfo = {
  displayName: string
  isDirect: boolean
  otherMemberName: string | null
  /** Anfangsbuchstabe der anderen Person (nur bei 2er-Chat) */
  displayInitial: string | null
}

/**
 * Gibt den Anzeigenamen für einen Chat zurück.
 * Bei 2er-Chats: Name der anderen Person (wie WhatsApp).
 * Bei Gruppen: Gruppenname.
 */
export function getChatDisplayInfo(
  groupName: string,
  members: ChatMember[],
  currentUserId: string
): ChatDisplayInfo {
  if (members.length === 2) {
    const other = members.find(m => m.user_id !== currentUserId)
    if (other) {
      return {
        displayName: other.display_name,
        isDirect: true,
        otherMemberName: other.display_name,
        displayInitial: other.display_name.charAt(0).toUpperCase(),
      }
    }
  }
  return {
    displayName: groupName,
    isDirect: false,
    otherMemberName: null,
    displayInitial: null,
  }
}
