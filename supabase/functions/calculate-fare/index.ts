import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeCategory(raw: any): string {
  const v = String(raw || "").toLowerCase().trim();
  if (["buddy_lite","lite","go","economy","buddy"].includes(v)) return "buddy_lite";
  if (["buddy_plus","plus","comfort","standard"].includes(v)) return "buddy_plus";
  if (["buddy_max","max","xl","family","buddy_xl","buddy_family"].includes(v)) return "buddy_max";
  return "buddy_plus";
}

function haversine(a: [number,number], b: [number,number]) {
  const toRad = (d:number)=>d*Math.PI/180;
  const dLat = toRad(b[1]-a[1]); const dLng = toRad(b[0]-a[0]);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a[1]))*Math.cos(toRad(b[1]))*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { category, pickup, dropoff, distance_km, duration_min } = body;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const finalCategory = normalizeCategory(category);

    // 1. Calculate distance - from coords if provided, else from body
    let km = Number(distance_km);
    let mins = Number(duration_min);
    let geometry = null;

    if (pickup && dropoff) {
      const p: [number,number] = [Number(pickup.lng), Number(pickup.lat)];
      const d: [number,number] = [Number(dropoff.lng), Number(dropoff.lat)];
      const straight = haversine(p, d);
      // Road distance is ~1.35x straight line in Polokwane
      km = Math.max(1, straight * 1.35);
      mins = Math.max(3, Math.round(km / 0.55)); // avg 33km/h city
      // Build simple geometry for map line
      geometry = { type: "LineString", coordinates: [p, d] };
    }
    if (!Number.isFinite(km)) km = 5;
    if (!Number.isFinite(mins)) mins = 12;
    km = Math.round(km * 10) / 10;

    // 2. Get rule from fare_rules
    const { data: rule, error } = await supabase
      .from("fare_rules")
      .select("*")
      .eq("category", finalCategory)
      .eq("active", true)
      .single();
    if (error || !rule) throw new Error(`No fare_rule for ${finalCategory}`);

    // 3. Calculate fare
    let fare = Number(rule.base_fare) + (Number(rule.per_km) * km) + (Number(rule.per_minute) * mins);
    fare = Math.max(fare, Number(rule.min_fare));
    fare = Math.round(fare);

    // 4. Save quote to DB if table exists (for verification in rides.fare_quote_id)
    const quote_id = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    // Try to insert into fare_quotes, ignore if table doesn't exist
    try {
      await supabase.from("fare_quotes").insert({
        id: quote_id,
        category: finalCategory,
        distance_km: km,
        duration_min: mins,
        total_fare: fare,
        expires_at,
        pickup_lat: pickup?.lat, pickup_lng: pickup?.lng,
        dropoff_lat: dropoff?.lat, dropoff_lng: dropoff?.lng,
      });
    } catch {}

    // 5. RETURN EXACT SHAPE PassengerHome EXPECTS
    return new Response(JSON.stringify({
      success: true,
      quote_id,
      category: finalCategory,
      distance_km: km,
      duration_min: mins,
      total_fare: fare,
      fare: fare, // for backward compat
      geometry,
      expires_at,
      breakdown: {
        base: Number(rule.base_fare),
        per_km: Number(rule.per_km),
        per_minute: Number(rule.per_minute),
        min_fare: Number(rule.min_fare),
      }
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});