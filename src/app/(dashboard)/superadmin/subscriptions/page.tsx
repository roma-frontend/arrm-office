"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Users, 
  Plus, 
  CreditCard, 
  Calendar,
  DollarSign,
  Shield,
  X,
  CheckCircle,
  AlertCircle,
  ShieldAlert
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthStore } from "@/store/useAuthStore";

const SUPERADMIN_EMAIL = "romangulanyan@gmail.com";

export default function SubscriptionsManagementPage() {
  const subscriptions = useQuery(api.subscriptions_admin.listAllWithUsers);
  const allOrganizations = useQuery(api.organizations.listAll);
  const createManual = useMutation(api.subscriptions_admin.createManualSubscription);
  const cancelSub = useMutation(api.subscriptions_admin.cancelSubscription);
  
  // Get current user from useAuthStore (works with both email/password and OAuth)
  const { user } = useAuthStore();

  const [showForm, setShowForm] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("enterprise");
  const [customPrice, setCustomPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Check if user is superadmin
  const isSuperAdmin = user?.role === "superadmin" || user?.email?.toLowerCase() === SUPERADMIN_EMAIL;
  
  console.log("[Subscriptions Page] user from useAuthStore:", user);
  console.log("[Subscriptions Page] isSuperAdmin:", isSuperAdmin, "role:", user?.role, "email:", user?.email);
  
  // Wait for user to load
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div>Loading...</div>
      </div>
    );
  }
  
  // If not superadmin, show access denied
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-6 h-6" />
              <CardTitle>Access Denied</CardTitle>
            </div>
            <CardDescription>
              This page is only accessible to the superadmin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Subscription management features are restricted to authorized personnel only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateSubscription = async () => {
    if (!selectedOrganization) {
      toast.error("Please select an organization");
      return;
    }

    setLoading(true);
    try {
      const result = await createManual({
        organizationId: selectedOrganization as Id<"organizations">,
        plan: selectedPlan,
        customPrice: customPrice ? parseFloat(customPrice) : undefined,
        notes: notes || undefined,
      });

      toast.success(`Subscription ${result.action} successfully!`);
      setShowForm(false);
      setSelectedOrganization("");
      setCustomPrice("");
      setNotes("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create subscription");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (subId: Id<"subscriptions">) => {
    if (!confirm("Are you sure you want to cancel this subscription?")) return;

    try {
      await cancelSub({ subscriptionId: subId });
      toast.success("Subscription canceled");
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel");
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-500/10 text-green-500 border-green-500/20",
      canceled: "bg-red-500/10 text-red-500 border-red-500/20",
      trialing: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      past_due: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    };
    
    return (
      <Badge variant="outline" className={colors[status] || ""}>
        {status === "active" && <CheckCircle className="w-3 h-3 mr-1" />}
        {status === "canceled" && <X className="w-3 h-3 mr-1" />}
        {status}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Subscription Management</h1>
          <p className="text-[var(--text-muted)] mt-1">Manage customer subscriptions and Enterprise access</p>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancel" : "Add Manual Subscription"}
        </Button>
      </div>

      {/* Create Manual Subscription Form */}
      {showForm && (
        <Card className="border-[var(--primary)]/20 bg-[var(--card)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--primary)]" />
              Create Manual Subscription (Enterprise)
            </CardTitle>
            <CardDescription>
              Manually assign Enterprise plan to a customer after agreement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="organization">Select Organization</Label>
              <select
                id="organization"
                value={selectedOrganization}
                onChange={(e) => setSelectedOrganization(e.target.value)}
                className="w-full mt-1.5 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="">
                  {allOrganizations === undefined 
                    ? "Loading organizations..." 
                    : allOrganizations.length === 0 
                    ? "No organizations found" 
                    : "-- Select an organization --"}
                </option>
                {allOrganizations?.map((org: any) => (
                  <option key={org._id} value={org._id}>
                    {org.name} ({org.slug}) - {org.employeeCount || 0} employees
                  </option>
                ))}
              </select>
              {allOrganizations !== undefined && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Found {allOrganizations.length} organization(s)
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="plan">Plan</Label>
              <select
                id="plan"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="w-full mt-1.5 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="enterprise">Enterprise (Custom)</option>
                <option value="professional">Professional</option>
                <option value="starter">Starter</option>
              </select>
            </div>

            <div>
              <Label htmlFor="price">Custom Price (Optional)</Label>
              <Input
                id="price"
                type="number"
                placeholder="e.g., 299"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="mt-1.5"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">Leave empty for standard pricing</p>
            </div>

            <div>
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                placeholder="Contract details, special terms, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1.5"
                rows={3}
              />
            </div>

            <Button 
              onClick={handleCreateSubscription}
              disabled={loading || !selectedOrganization}
              className="w-full"
            >
              {loading ? "Creating..." : "Create Subscription"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions List */}
      <Card className="bg-[var(--card)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            All Subscriptions
          </CardTitle>
          <CardDescription>Total: {subscriptions?.length || 0}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Organization</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Employees</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Plan</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Status</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Type</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Price</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Expires</th>
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions?.map((sub) => (
                  <tr key={sub._id} className="border-b border-[var(--border)] hover:bg-[var(--background-subtle)] transition-colors">
                    <td className="py-3 px-2">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{sub.organizationName || "Unknown"}</p>
                        <p className="text-xs text-[var(--text-muted)]">{sub.organizationSlug}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1 text-[var(--text-muted)]">
                        <Users className="w-3 h-3" />
                        <span>{sub.employeeCount || 0}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className="capitalize font-semibold text-[var(--text-primary)]">
                        {sub.plan === "enterprise" && "🏢 "}
                        {sub.plan === "professional" && "💼 "}
                        {sub.plan === "starter" && "⚡ "}
                        {sub.plan}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {getStatusBadge(sub.status)}
                    </td>
                    <td className="py-3 px-2">
                      {sub.isManual ? (
                        <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                          Manual
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          Stripe
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-2 text-[var(--text-primary)]">
                      ${sub.metadata?.customPrice || (sub.plan === "professional" ? "49" : sub.plan === "enterprise" ? "Custom" : "0")}
                    </td>
                    <td className="py-3 px-2 text-[var(--text-muted)] text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      {sub.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(sub._id)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
