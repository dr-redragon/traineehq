import {
  Stethoscope, Scissors, Bone, Activity, Eye, Brain,
  Heart, CircleDot, Hand, Smile, Baby, Syringe,
  Radio, HeartPulse, Pill, Thermometer, FileText,
  Ear, Droplets, Dna, Microscope, TestTube, Scan, ScanLine,
  ShieldCheck, Cross, Radiation, Zap,
  Ribbon, Waypoints, Sparkles, Flame,
  Clipboard, BookOpen, GraduationCap, Hospital, Ambulance,
  Beaker, Gauge, Clock, Target, Layers,
  Users, Globe, Star, Award, BadgeCheck,
  Lightbulb, Settings, Wrench, Puzzle, BarChart3,
  Flower2, TreePine, Shell, Bug, Apple,
  Footprints, PersonStanding, Accessibility, HeartHandshake,
  BicepsFlexed, Fingerprint, ScanFace, ScanEye,
  Bandage, Blend, Disc, Focus, Orbit, Radius,
  ShieldPlus, ShieldAlert, CircleAlert, CircleCheck,
  Pipette, FlaskConical, FlaskRound, Atom,
  Wind, Waves, Shrub, Mountain, Gem,
  Crown, Medal, Trophy, Hammer, Magnet,
  Network, GitBranch, Share2, Route,
  Laptop, Monitor, Wifi, Signal,
  Megaphone, Bell, AlertTriangle, Info,
  Bed, Sofa, Tent, Building2,
  Plane, Ship, Truck,
  Palette, Paintbrush, Pen, PenTool,
  Camera, Image, SunMedium, Moon, CloudRain,
  Lock, Key, Shield, Umbrella,
  Phone, Mail, MapPin, Navigation,
  Calendar, CalendarClock, Timer, Hourglass,
  FileHeart, FilePlus, FileSearch, FolderHeart,
  // NEW — medical & specialty icons
  BriefcaseMedical, Biohazard, BrainCircuit, BrainCog,
  BedDouble, BedSingle,
  ClipboardPlus, ClipboardList, ClipboardCheck,
  Crosshair, HeartCrack, HeartOff,
  HandHeart, HandHelping, HandCoins, Handshake,
  Siren, Scale, Glasses, Leaf, Sprout,
  UserRound, UserCheck, ContactRound, BookHeart, Earth,
  CircleGauge, Component, FileScan,
  EyeClosed, DnaOff, EarOff,
  // Additional body / specialty metaphors
  Angry, Frown, Meh, SmilePlus, Laugh,
  Grab, Move, RotateCcw, RotateCw, RefreshCw,
  Minimize2, Maximize2, ZoomIn, ZoomOut,
  Webhook, Cable, Unplug, PlugZap,
  Ratio, Binary, Hash, Percent,
  Shapes, Box, Cylinder, Cone, Triangle,
  Snowflake, Droplet, CloudSun, Sunrise, Sunset,
  AirVent, UserCog, Tangent,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  // ── Medical instruments & tools ──
  Stethoscope, Scissors, Syringe, Thermometer, Microscope,
  TestTube, Beaker, Scan, ScanLine, Pill, Bandage,
  Pipette, FlaskConical, FlaskRound, BriefcaseMedical,
  FileScan, Crosshair,

  // ── Body parts & organs ──
  Bone, Eye, EyeClosed, Brain, BrainCircuit, BrainCog,
  Heart, HeartPulse, HeartCrack, HeartOff, HeartHandshake,
  Hand, HandHeart, HandHelping, HandCoins, Handshake, Grab,
  Ear, EarOff, Smile, SmilePlus, Laugh, Frown, Meh, Angry,
  Baby, Footprints, PersonStanding, BicepsFlexed, Fingerprint,
  ScanFace, ScanEye,

  // ── Medical concepts & vitals ──
  Activity, Radio, CircleDot, Dna, DnaOff, Droplets, Droplet,
  Radiation, Cross, Biohazard, Zap, Siren,
  ShieldCheck, ShieldPlus, ShieldAlert,
  Ribbon, Atom, Wind, Waves,
  Accessibility, Scale, Glasses,

  // ── Hospital & care ──
  Hospital, Ambulance, Bed, BedDouble, BedSingle, Building2,
  Clipboard, ClipboardPlus, ClipboardList, ClipboardCheck,
  FileText, FileHeart, FilePlus, FileSearch, FolderHeart, BookHeart,

  // ── Specialty-themed ──
  Waypoints, Sparkles, Flame, Target, Layers, Gauge, CircleGauge,
  Focus, Orbit, Radius, Disc, Blend, Component,
  Network, GitBranch, Share2, Route, Webhook, Cable,
  Crosshair2: Crosshair,

  // ── Shapes & structure ──
  Shapes, Box, Cylinder, Cone, Triangle,
  Ratio, Binary, Hash, Percent,

  // ── Education & admin ──
  BookOpen, GraduationCap, Lightbulb, Award, BadgeCheck,
  Star, Users, UserRound, UserCheck, ContactRound,
  Globe, Earth, Clock, Calendar, CalendarClock, Timer, Hourglass,
  Crown, Medal, Trophy,

  // ── Alert & info ──
  Megaphone, Bell, AlertTriangle, Info,
  CircleAlert, CircleCheck, Siren2: Siren,

  // ── Nature & organic ──
  Flower2, TreePine, Shell, Bug, Apple, Shrub, Mountain, Gem,
  Leaf, Sprout, Snowflake,

  // ── Communication ──
  Phone, Mail, MapPin, Navigation,

  // ── Tech & tools ──
  Settings, Wrench, Puzzle, BarChart3, Hammer, Magnet,
  Laptop, Monitor, Wifi, Signal, PlugZap,
  Lock, Key, Shield, Umbrella,

  // ── Motion & transformation ──
  Move, RotateCcw, RotateCw, RefreshCw,
  Minimize2, Maximize2, ZoomIn, ZoomOut,

  // ── Creative ──
  Palette, Paintbrush, Pen, PenTool,
  Camera, Image, SunMedium, Moon, CloudRain, CloudSun, Sunrise, Sunset,

  // ── Transport & environment ──
  Plane, Ship, Truck, Tent, Sofa,

  // ── Additional ──
  AirVent,    // lungs / respiratory
  UserCog,    // elderly / geriatrics
  Tangent,    // gut / gastroenterology (winding tube shape)
};

// Remove duplicate aliases
delete (iconMap as any).Crosshair2;
delete (iconMap as any).Siren2;

export const ICON_NAMES = Object.keys(iconMap);

export function getIcon(name: string | null): LucideIcon {
  return iconMap[name ?? "Stethoscope"] ?? Stethoscope;
}
