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
import { Shield, Users, BookOpen, Phone, Megaphone, UserPlus, Building2, Stethoscope, ClipboardCheck } from "lucide-react";

const AdminPanel = () => {
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Manage users, permissions, content, contacts, and announcements</p>
          </div>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="bg-secondary/50 p-1 flex flex-wrap h-auto gap-1">
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
          </TabsList>

          <TabsContent value="users" className="mt-4"><AdminUsers /></TabsContent>
          <TabsContent value="content" className="mt-4"><AdminContent /></TabsContent>
          <TabsContent value="contacts" className="mt-4"><AdminContacts /></TabsContent>
          <TabsContent value="announcements" className="mt-4"><AdminAnnouncements /></TabsContent>
          <TabsContent value="requests" className="mt-4"><AdminAccessRequests /></TabsContent>
          <TabsContent value="attendance" className="mt-4"><AdminAttendance /></TabsContent>
          <TabsContent value="specialties" className="mt-4"><AdminSpecialties /></TabsContent>
          <TabsContent value="deaneries" className="mt-4"><AdminDeaneries /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminPanel;
