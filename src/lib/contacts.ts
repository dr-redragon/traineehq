import { Building2, GraduationCap, UserCheck, Users, ClipboardList, Landmark, Hospital, Phone } from "lucide-react";

export interface Contact {
  id: string;
  name: string;
  role: string;
  category: string;
  organisation: string;
  email: string;
  phone?: string;
  specialtyId?: string; // null = global
}

export const contactCategories = [
  { key: "deanery", label: "Deanery / HEE Regional", icon: Landmark },
  { key: "tpd", label: "Training Programme Director", icon: GraduationCap },
  { key: "associate_dean", label: "Associate Dean", icon: UserCheck },
  { key: "educational_supervisor", label: "Educational Supervisor", icon: Users },
  { key: "trainee_rep", label: "Trainee Representative", icon: ClipboardList },
  { key: "royal_college", label: "Royal College / SAC", icon: Building2 },
  { key: "trust_lead", label: "Hospital / Trust Training Lead", icon: Hospital },
  { key: "rota_admin", label: "Rota Coordinator / Admin", icon: Phone },
];

export function obfuscateEmail(email: string): string {
  return email;
}

export const sampleContacts: Contact[] = [
  { id: "1", name: "Prof. Sarah Mitchell", role: "Postgraduate Dean", category: "deanery", organisation: "NHS England — North West", email: "sarah.mitchell@hee.nhs.uk", specialtyId: undefined },
  { id: "2", name: "Mr James Thornton", role: "Head of School of Surgery", category: "associate-dean", organisation: "NHS England — South East", email: "james.thornton@hee.nhs.uk", specialtyId: undefined },
  { id: "3", name: "Dr Priya Sharma", role: "Training Programme Director — ENT", category: "tpd", organisation: "Health Education England", email: "priya.sharma@nhs.net", specialtyId: "ent" },
  { id: "4", name: "Mr David Chen", role: "Training Programme Director — General Surgery", category: "tpd", organisation: "Health Education England", email: "david.chen@nhs.net", specialtyId: "general-surgery" },
  { id: "5", name: "Miss Rebecca Taylor", role: "Educational Supervisor", category: "educational-supervisor", organisation: "Manchester University NHS FT", email: "rebecca.taylor@mft.nhs.uk", specialtyId: "ent" },
  { id: "6", name: "Mr Kwame Asante", role: "Educational Supervisor", category: "educational-supervisor", organisation: "Leeds Teaching Hospitals NHS Trust", email: "kwame.asante@nhs.net", specialtyId: "general-surgery" },
  { id: "7", name: "Dr Fatima Al-Hassan", role: "ST Rep — ENT", category: "trainee-rep", organisation: "North West Deanery", email: "fatima.alhassan@nhs.net", specialtyId: "ent" },
  { id: "8", name: "Mr Oliver Brooks", role: "SAC Representative — General Surgery", category: "royal-college", organisation: "Royal College of Surgeons of England", email: "oliver.brooks@rcseng.ac.uk", specialtyId: "general-surgery" },
  { id: "9", name: "Mrs Helen Wright", role: "Trust Training Lead", category: "trust-lead", organisation: "University Hospitals Birmingham NHS FT", email: "helen.wright@uhb.nhs.uk", specialtyId: undefined },
  { id: "10", name: "Ms Julie Brennan", role: "Rota Coordinator", category: "rota-admin", organisation: "Oxford University Hospitals NHS FT", email: "julie.brennan@ouh.nhs.uk", specialtyId: "trauma-ortho" },
  { id: "11", name: "Mr Raj Patel", role: "Training Programme Director — T&O", category: "tpd", organisation: "Health Education England", email: "raj.patel@hee.nhs.uk", specialtyId: "trauma-ortho" },
  { id: "12", name: "Dr Emily Foster", role: "Training Programme Director — Anaesthetics", category: "tpd", organisation: "Health Education England", email: "emily.foster@hee.nhs.uk", specialtyId: "anaesthetics" },
];
