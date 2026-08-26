import {
  Stethoscope, Scissors, Bone, Activity, Eye, Brain,
  Heart, CircleDot, Hand, Smile, Baby, Syringe,
  Radio, HeartPulse, Pill, Thermometer
} from "lucide-react";

export interface Specialty {
  id: string;
  name: string;
  shortName: string;
  icon: typeof Stethoscope;
  color: string;
}

export const specialties: Specialty[] = [
  { id: "ent", name: "ENT (Otolaryngology – Head & Neck Surgery)", shortName: "ENT", icon: Stethoscope, color: "174 60% 40%" },
  { id: "general-surgery", name: "General Surgery", shortName: "General Surgery", icon: Scissors, color: "215 50% 40%" },
  { id: "trauma-ortho", name: "Trauma & Orthopaedics", shortName: "T&O", icon: Bone, color: "38 80% 50%" },
  { id: "urology", name: "Urology", shortName: "Urology", icon: Activity, color: "280 50% 50%" },
  { id: "ophthalmology", name: "Ophthalmology", shortName: "Ophthalmology", icon: Eye, color: "200 70% 50%" },
  { id: "neurosurgery", name: "Neurosurgery", shortName: "Neurosurgery", icon: Brain, color: "340 60% 50%" },
  { id: "cardiothoracic", name: "Cardiothoracic Surgery", shortName: "Cardiothoracic", icon: Heart, color: "0 65% 50%" },
  { id: "vascular", name: "Vascular Surgery", shortName: "Vascular", icon: CircleDot, color: "15 75% 50%" },
  { id: "plastic-surgery", name: "Plastic Surgery", shortName: "Plastics", icon: Hand, color: "320 50% 50%" },
  { id: "omfs", name: "Oral & Maxillofacial Surgery", shortName: "OMFS", icon: Smile, color: "45 70% 45%" },
  { id: "obs-gynae", name: "Obstetrics & Gynaecology", shortName: "O&G", icon: Baby, color: "300 45% 55%" },
  { id: "paediatric-surgery", name: "Paediatric Surgery", shortName: "Paeds Surgery", icon: Baby, color: "160 55% 45%" },
  { id: "anaesthetics", name: "Anaesthetics & ICM", shortName: "Anaesthetics", icon: Syringe, color: "190 60% 45%" },
  { id: "radiology", name: "Radiology", shortName: "Radiology", icon: Radio, color: "220 55% 50%" },
  { id: "psychiatry", name: "Psychiatry", shortName: "Psychiatry", icon: HeartPulse, color: "260 50% 55%" },
  { id: "internal-medicine", name: "Internal Medicine / IMT", shortName: "Medicine", icon: Pill, color: "150 45% 45%" },
];

export const defaultSubsections = [
  "Curriculum Overview",
  "Exam Preparation",
  "Core Clinical Skills",
  "Research & Audit",
  "Operative / Procedural Skills",
  "Teaching & Leadership",
  "Simulation & Courses",
  "Useful Guidelines & Protocols",
];
