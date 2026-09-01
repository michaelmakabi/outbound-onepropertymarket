// Icon map for CRM pipeline stages / dispositions. Stages store a lucide icon
// name (see the standard-pipeline seed); this renders it, colored, with a dot fallback.
import {
  UserPlus, PhoneMissed, Voicemail, PhoneForwarded, CalendarClock, PhoneOff, Ban,
  ThumbsDown, Footprints, Meh, Flame, CalendarCheck, Send, Handshake, BadgeCheck,
  XCircle, Trophy, Archive, Circle,
  Star, Heart, DollarSign, Home, FileText, Clock, MapPin, Target, TrendingUp,
  Users, Mail, Phone, AlertCircle, CheckCircle2, Zap, Key, Building2, Search, Snowflake, Hourglass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  UserPlus, PhoneMissed, Voicemail, PhoneForwarded, CalendarClock, PhoneOff, Ban,
  ThumbsDown, Footprints, Meh, Flame, CalendarCheck, Send, Handshake, BadgeCheck,
  XCircle, Trophy, Archive,
  Star, Heart, DollarSign, Home, FileText, Clock, MapPin, Target, TrendingUp,
  Users, Mail, Phone, AlertCircle, CheckCircle2, Zap, Key, Building2, Search, Snowflake, Hourglass,
};

// Ordered list of the icon names available in the stage curation picker.
export const STAGE_ICON_NAMES: string[] = Object.keys(MAP);

export function StageIcon({ name, color, className }: { name?: string | null; color?: string; className?: string }) {
  const Ico = (name && MAP[name]) || Circle;
  return <Ico className={className || 'h-3.5 w-3.5'} style={color ? { color } : undefined} strokeWidth={2.25} />;
}
