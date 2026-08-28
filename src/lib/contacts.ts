import { Building2, GraduationCap, UserCheck, Users, ClipboardList, Landmark, Hospital, Phone } from "lucide-react";

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
