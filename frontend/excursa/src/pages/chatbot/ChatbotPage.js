/**
 * ChatbotPage - Legacy wrapper component
 * 
 * This component wraps ChatbotScreen to maintain backward compatibility.
 * New implementations should import ChatbotScreen directly from ChatbotScreen.js
 * 
 * This page is kept for:
 * - Existing navigation references
 * - Gradual migration path
 * - Testing purposes
 */

import React from 'react';
import ChatbotScreen from './ChatbotScreen';

export default function ChatbotPage(props) {
  return <ChatbotScreen {...props} />;
}
