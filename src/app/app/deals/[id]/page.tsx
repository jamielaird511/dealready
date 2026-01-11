"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [creatingSubmission, setCreatingSubmission] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadDeal() {
      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("deals")
        .select("*")
        .eq("id", dealId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error loading deal:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setError("Failed to load deal");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("not_found");
        setLoading(false);
        return;
      }

      setDeal(data);
      setName(data.name || "");
      setStatus(data.status || "draft");
      setLoading(false);
    }

    if (dealId) {
      loadDeal();
    }
  }, [dealId]);

  useEffect(() => {
    async function loadSubmissions() {
      if (!dealId) return;

      const supabase = supabaseBrowser();

      const { data, error: fetchError } = await supabase
        .from("submissions")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error loading submissions:", {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
        });
        setSubmissionsLoading(false);
        return;
      }

      setSubmissions(data || []);
      setSubmissionsLoading(false);
    }

    if (dealId && !loading) {
      loadSubmissions();
    }
  }, [dealId, loading]);

  async function handleSave() {
    if (!deal) return;

    setSaving(true);
    setSaveMessage(null);
    const supabase = supabaseBrowser();

    try {
      // Get signed-in user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setSaveMessage({ type: "error", text: "Not authenticated. Please sign in again." });
        setSaving(false);
        return;
      }

      // Update deal (RLS will ensure only the broker can update their own deals)
      const { data: updatedDeal, error: updateError } = await supabase
        .from("deals")
        .update({
          name: name.trim() || "New Deal",
          status: status,
        })
        .eq("id", dealId)
        .eq("broker_id", user.id) // Extra safety: ensure it's the broker's deal
        .select()
        .single();

      if (updateError) {
        console.error("Error updating deal:", {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        setSaveMessage({ type: "error", text: `Error saving deal: ${updateError.message}` });
        setSaving(false);
        return;
      }

      setDeal(updatedDeal);
      setSaveMessage({ type: "success", text: "Deal saved successfully." });
      setTimeout(() => setSaveMessage(null), 3000);
      setSaving(false);
    } catch (err) {
      console.error("Error:", err);
      setSaveMessage({ type: "error", text: "An unexpected error occurred." });
      setSaving(false);
    }
  }

  async function createSubmission() {
    setCreatingSubmission(true);
    const supabase = supabaseBrowser();

    try {
      // Get signed-in user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Error getting user:", userError);
        alert("Error: Not authenticated. Please sign in again.");
        setCreatingSubmission(false);
        return;
      }

      // Fetch organization_id from organization_members table
      const { data: orgMember, error: orgError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (orgError || !orgMember?.organization_id) {
        console.error("Error fetching organization:", orgError);
        alert("Error: Could not find organization. Please contact support.");
        setCreatingSubmission(false);
        return;
      }

      const orgId = orgMember.organization_id;

      // Generate title from deal name
      const title = deal?.name ? `${deal.name} – Submission` : "New Submission";

      // Insert submission with required fields
      const { data: submission, error } = await supabase
        .from("submissions")
        .insert({
          org_id: orgId,
          created_by: user.id,
          title: title,
          deal_id: dealId,
          status: "draft",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating submission:", error);
        console.error("Error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        alert("Error creating submission. Please try again.");
        setCreatingSubmission(false);
        return;
      }

      // Route to submission page
      router.push(`/app/submissions/${submission.id}`);
      setCreatingSubmission(false);
    } catch (err) {
      console.error("Error:", err);
      setCreatingSubmission(false);
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <p>Loading deal...</p>
      </main>
    );
  }

  if (error) {
    if (error === "not_found") {
      return (
        <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.2)",
              borderRadius: 10,
              padding: 40,
              background: "white",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Deal not found
            </h2>
            <p style={{ color: "#6b7280", marginBottom: 24 }}>
              This deal may not exist or you may not have permission to view it.
            </p>
            <button
              onClick={() => router.push("/app")}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                cursor: "pointer",
                fontWeight: 600,
                background: "white",
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      );
    }

    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 40,
            background: "white",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Unable to load deal
          </h2>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            Please try again later.
          </p>
          <button
            onClick={() => router.push("/app")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              fontWeight: 600,
              background: "white",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push("/app")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Edit Deal</h1>
      </div>

      {/* Submissions Section */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 0 }}>Submissions</h2>
          <button
            onClick={createSubmission}
            disabled={creatingSubmission}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: creatingSubmission ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: creatingSubmission ? 0.6 : 1,
            }}
          >
            {creatingSubmission ? "Creating..." : "Create Submission"}
          </button>
        </div>

        {submissionsLoading ? (
          <p style={{ opacity: 0.6 }}>Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No submissions yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {submissions.map((submission) => (
              <div
                key={submission.id}
                onClick={() => {
                  router.push(`/app/submissions/${submission.id}`);
                }}
                style={{
                  border: "1px solid rgba(0,0,0,0.2)",
                  borderRadius: 10,
                  padding: 16,
                  background: "white",
                  cursor: "pointer",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {submission.lender_name || "Unnamed Lender"}
                    </div>
                    <div style={{ fontSize: 14, opacity: 0.7 }}>
                      Status: {submission.status || "draft"}
                    </div>
                    {submission.created_at && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                        Created: {new Date(submission.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.5 }}>
                    {submission.id.substring(0, 8)}...
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deal Form */}
      {deal && (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 20,
            background: "white",
            marginBottom: 24,
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Deal Information</h3>
          
          {saveMessage && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 8,
                background: saveMessage.type === "success" ? "rgba(0,128,0,0.08)" : "rgba(220,20,60,0.08)",
                color: saveMessage.type === "success" ? "green" : "crimson",
                border: saveMessage.type === "success"
                  ? "1px solid rgba(0,128,0,0.2)"
                  : "1px solid rgba(220,20,60,0.2)",
              }}
            >
              {saveMessage.text}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#374151",
                }}
              >
                Deal Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter deal name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "1px solid rgba(0,0,0,0.2)",
                  borderRadius: 8,
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#374151",
                }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  border: "1px solid rgba(0,0,0,0.2)",
                  borderRadius: 8,
                  outline: "none",
                  background: "white",
                }}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#10b981",
                  color: "white",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
