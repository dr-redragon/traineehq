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
import { AdminSpecialtyRequests } from "@/components/admin/AdminSpecialtyRequests";
import { CountBadge } from "@/components/CountBadge";
import { usePendingRequestCounts } from "@/hooks/usePendingRequests";
import { Shield, Users, BookOpen, Phone, Megaphone, UserPlus, Building2, Stethoscope, ClipboardCheck, ScrollText } from "lucide-react";

const AdminPanel = () => {
  // Shared with the sidebar's badge, so the two always agree.
  const { data: pending } = usePendingRequestCounts();

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-4 p-4 sm:space-y-8 sm:p-9">
        {/* The panel's layout is deliberately unchanged — same nine tabs in
            the same order, same content in each. Only the design language
            moves. On a phone the header and padding shrink so the content
            starts higher up the screen. */}
        <div className="flex items-center gap-3 border-b-2 border-border pb-3 sm:gap-4 sm:pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-accent sm:h-12 sm:w-12">
            <Shield className="h-5 w-5 text-rule sm:h-6 sm:w-6" />
          </div>
          <div>
            <p className="ds-kicker mb-1 hidden sm:block">Administration</p>
            <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[32px]">Admin Panel</h1>
            <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
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
              <CountBadge count={pending?.total} label="pending requests" />
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

          <TabsContent value="users" className="mt-3 sm:mt-4"><AdminUsers /></TabsContent>
          <TabsContent value="content" className="mt-4"><AdminContent /></TabsContent>
          <TabsContent value="contacts" className="mt-4"><AdminContacts /></TabsContent>
          <TabsContent value="announcements" className="mt-4"><AdminAnnouncements /></TabsContent>
          <TabsContent value="requests" className="mt-4 space-y-10">
            <AdminAccessRequests />
            <AdminSpecialtyRequests />
          </TabsContent>
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
