import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminContent } from "@/components/admin/AdminContent";
import { AdminContacts } from "@/components/admin/AdminContacts";
import { AdminAnnouncements } from "@/components/admin/AdminAnnouncements";
import { AdminAccessRequests } from "@/components/admin/AdminAccessRequests";
import { AdminDeaneries } from "@/components/admin/AdminDeaneries";
import { AdminSpecialties } from "@/components/admin/AdminSpecialties";
import { AdminAttendance } from "@/components/admin/AdminAttendance";
import { AdminAuditLog } from "@/components/admin/AdminAuditLog";
import { Shield, Users, BookOpen, Phone, Megaphone, UserPlus, Building2, Stethoscope, ClipboardCheck, ScrollText } from "lucide-react";

const AdminPanel = () => {
  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-8 p-9">
        {/* The panel's layout is deliberately unchanged — same nine tabs in
            the same order, same content in each. Only the design language
            moves. */}
        <div className="flex items-center gap-4 border-b-2 border-border pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-accent-100">
            <Shield className="h-6 w-6 text-rule" />
          </div>
          <div>
            <p className="ds-kicker mb-1">Administration</p>
            <h1 className="font-display text-[32px] font-extrabold leading-tight tracking-tight">Admin Panel</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage users, permissions, content, contacts, and announcements
            </p>
          </div>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="h-auto flex-wrap gap-0">
            <TabsTrigger value="users" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Users &</span> Permissions
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" /> Content
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1.5 text-xs">
              <Phone className="h-3.5 w-3.5" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1.5 text-xs">
              <Megaphone className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Announcements</span><span className="sm:hidden">News</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5 text-xs">
              <UserPlus className="h-3.5 w-3.5" /> Requests
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5 text-xs">
              <ClipboardCheck className="h-3.5 w-3.5" /> Attendance
            </TabsTrigger>
            <TabsTrigger value="specialties" className="gap-1.5 text-xs">
              <Stethoscope className="h-3.5 w-3.5" /> Specialties
            </TabsTrigger>
            <TabsTrigger value="deaneries" className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" /> Deaneries
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5 text-xs">
              <ScrollText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Audit</span> Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4"><AdminUsers /></TabsContent>
          <TabsContent value="content" className="mt-4"><AdminContent /></TabsContent>
          <TabsContent value="contacts" className="mt-4"><AdminContacts /></TabsContent>
          <TabsContent value="announcements" className="mt-4"><AdminAnnouncements /></TabsContent>
          <TabsContent value="requests" className="mt-4"><AdminAccessRequests /></TabsContent>
          <TabsContent value="attendance" className="mt-4"><AdminAttendance /></TabsContent>
          <TabsContent value="specialties" className="mt-4"><AdminSpecialties /></TabsContent>
          <TabsContent value="deaneries" className="mt-4"><AdminDeaneries /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AdminAuditLog /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminPanel;
