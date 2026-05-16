"use client";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { carbonForAge } from "@/lib/map-utils";
import { useAuth } from "@/lib/auth-context";
import { CarbonBarChart, buildBarPoints, carbonCo2, CUT_AGE, type BarPoint } from "./CarbonBarChart";
import { estimateCarbon, type PlantationPolygon, type EstimationResponse, type YearlyEstimate } from "@/lib/carbon-api";


// ── Types ─────────────────────────────────────────────────────────────────
type Props = {
    searchRunning: boolean;
    searchErr: string | null;
    searchCount: number | null;
    searchTruncated: boolean;
    parcelFeatures: GeoJSON.Feature[];
    userDisplayName?: string;
    drawnGeometry?: GeoJSON.Geometry | null;
    onFlyTo: (feature: GeoJSON.Feature) => void;
    onReset?: () => void;
    onBack?: () => void;
    onCancel?: () => void;
    currentStep: 1 | 2 | 3;
    onStepChange: (step: 1 | 2 | 3) => void;
    selectedMapPlotIndex?: number | "total";
    onMapPlotSelected?: (idx: number | "total") => void;
    onDeleteParcel?: (idx: number) => void;
    onDrawMore?: () => void;
    isDrawing?: boolean;
    onFinishDraw?: () => void;
    onCancelDraw?: () => void;
};

type PlotTab = "analyze" | "forecast";
type ForecastYr = 3 | 5 | 7;
type SubStep = "form" | "carbon" | "save";

interface PlotFormData {
    plantStatus: "new" | "old" | "";
    plantYear: string;
    treeCount: string;
    variety: string;
    spacing: string;
    luChecked: Record<string, boolean>;
    luMockData: Record<string, { rai: number, pct: number }>;
}

const VARIETY_OPTIONS = [
    "RRIM 600", "GT1", "BPM 24", "PB 235", "PB 260",
    "RRIT 408", "RRIT 251", "สงขลา 36", "RRIM 712", "อื่นๆ",
];
const SPACING_OPTIONS = ["2.5x8", "3x7", "2.5x7", "2x6", "3x8"];

const CURRENT_CE = new Date().getFullYear();
const CURRENT_BE = CURRENT_CE + 543;

const NEW_YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(CURRENT_BE + i));
const OLD_YEAR_OPTIONS = Array.from({ length: 2572 - 2534 + 1 }, (_, i) => String(2572 - i));

interface CarbonResult {
    plotIdx: number;
    age: number;
    plantYearBE: number;
    trees: number;
    spacing: string;
    variety: string;
    co2Now: number;
    source: "user" | "backend";
}

interface PlotInfo {
    age: number;
    plantYearBE: number;
    areaRai: number;
    trees: number;
    co2: number;
    confidence: number;
    province: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const THAI_PROVINCES = [
    "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา",
    "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก",
    "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี",
    "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี",
    "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก",
    "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน",
    "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน",
    "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม",
    "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี",
    "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์",
    "อุทัยธานี", "อุบลราชธานี",
];

// ── Helpers ───────────────────────────────────────────────────────────────
function parseRai(v: unknown): number {
    if (!v) return 0;
    const s = String(v).trim();
    const m = s.match(/^(\d+)-(\d+)-(\d+)/);
    if (m) return +m[1] + +m[2] * 0.25 + +m[3] / 400;
    return parseFloat(s) || 0;
}

function computePlot(feat: GeoJSON.Feature): PlotInfo {
    const p = (feat.properties ?? {}) as Record<string, unknown>;
    const areaRai = parseRai(p.grow_area || p.rai);

    let bPlantYear = Number(p.grow_year || 0);
    let bAge = Number(p.rubber_age || 0);

    const CURRENT_BE = new Date().getFullYear() + 543;

    // Normalize plant year to BE
    if (bPlantYear > 0 && bPlantYear < 2300) {
        bPlantYear += 543;
    }

    // If we have plantYear but no age, compute age
    if (bAge === 0 && bPlantYear > 0) {
        bAge = Math.max(0, CURRENT_BE - bPlantYear);
    }
    // If we have age but no plantYear, compute plantYear
    if (bPlantYear === 0 && bAge > 0) {
        bPlantYear = CURRENT_BE - bAge;
    }

    return {
        age: bAge,
        plantYearBE: bPlantYear,
        areaRai,
        trees: 0,
        co2: 0,
        confidence: 0,
        province: String(p.province ?? ""),
    };
}

function ageDistribution(age: number, conf: number) {
    const c = Math.min(Math.max(conf || 0.65, 0.1), 0.9);
    const rest = 1 - c;
    const raw = [rest * 0.18, rest * 0.32, c, rest * 0.35, rest * 0.15];
    const total = raw.reduce((a, b) => a + b, 0);
    return [age - 2, age - 1, age, age + 1, age + 2]
        .map((a, i) => ({ a, pct: Math.round((raw[i] / total) * 1000) / 10 }))
        .filter(({ a }) => a > 0);
}

function profileToBarPoints(profile: YearlyEstimate[], startAge: number): BarPoint[] {
    return profile.map((item, i) => {
        const age = startAge + i;
        return {
            age,
            yearBE: item.year + 543,
            co2: item.total_carbon_tCO2e,
            cycle: Math.floor(age / CUT_AGE),
            cycleAge: age,
            errorMargin: (item.ci_upper_tCO2e - item.ci_lower_tCO2e) / 2,
        };
    });
}

function aggregateProfiles(responses: EstimationResponse[], startAges: number[]): BarPoint[] {
    const profiles = responses.map(r => r.carbon_profile ?? []);
    if (!profiles.length || !profiles[0].length) return [];
    const len = Math.min(...profiles.map(p => p.length));
    const pts: BarPoint[] = [];
    for (let j = 0; j < len; j++) {
        const yearBE = profiles[0][j].year + 543;
        let totalCo2 = 0, sumSqErr = 0, totalAge = 0;
        for (let i = 0; i < profiles.length; i++) {
            const item = profiles[i][j];
            if (!item) continue;
            totalCo2 += item.total_carbon_tCO2e;
            const err = (item.ci_upper_tCO2e - item.ci_lower_tCO2e) / 2;
            sumSqErr += err * err;
            totalAge += startAges[i] + j;
        }
        const avgAge = Math.round(totalAge / profiles.length);
        if (avgAge > 35) break;
        pts.push({
            age: avgAge,
            yearBE,
            co2: totalCo2,
            cycle: Math.floor(avgAge / CUT_AGE),
            cycleAge: avgAge,
            errorMargin: Math.sqrt(sumSqErr),
        });
    }
    return pts;
}

function forecastPts(age: number, trees: number, years: ForecastYr) {
    return Array.from({ length: years + 1 }, (_, i) => ({
        yearBE: CURRENT_BE + i,
        co2: trees > 0 ? carbonForAge(age + i, trees).co2 : 0,
    }));
}

function generateMockLU(totalRai: number, checked: Record<string, boolean>) {
    const keys = Object.keys(checked).filter(k => checked[k] && !['U', 'W'].includes(k)); // Exclude disabled ones
    if (keys.length === 0) return {};
    const res: Record<string, { rai: number, pct: number }> = {};
    if (keys.length === 1) {
        res[keys[0]] = { rai: totalRai, pct: 100 };
        return res;
    }
    const basePct = Math.floor(100 / keys.length);
    let remaining = 100;
    keys.forEach((k, i) => {
        if (i === keys.length - 1) {
            res[k] = { rai: (remaining / 100) * totalRai, pct: remaining };
        } else {
            const pct = Math.max(1, basePct + Math.floor(Math.random() * 10 - 5));
            res[k] = { rai: (pct / 100) * totalRai, pct };
            remaining -= pct;
        }
    });
    return res;
}

function summaryForecast(plots: PlotInfo[], years: ForecastYr) {
    return Array.from({ length: years + 1 }, (_, i) => ({
        yearBE: CURRENT_BE + i,
        co2: plots.reduce((s, pl) => s + (pl.trees > 0 ? carbonForAge(pl.age + i, pl.trees).co2 : 0), 0),
    }));
}

// ── SVG: Age distribution bar chart with hover tooltip ────────────────────
function AgeBarChart({ age, conf, trees, isMobile }: { age: number; conf: number; trees: number; isMobile?: boolean }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const dist = ageDistribution(age, conf);
    const maxPct = Math.max(...dist.map(d => d.pct));

    const W = isMobile ? 400 : 550, BAR_W = isMobile ? 58 : 64, GAP = isMobile ? 10 : 22;
    const totalW = dist.length * BAR_W + (dist.length - 1) * GAP;
    const sx = (W - totalW) / 2;
    const BASE_Y = isMobile ? 180 : 200, MAX_BH = isMobile ? 120 : 140, H = isMobile ? 240 : 260;

    return (
        <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 14, padding: "12px 8px 8px", marginBottom: 12 }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", overflow: "visible" }}>
                <defs>
                    <linearGradient id="barGradMain" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <filter id="barShadow">
                        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#059669" floodOpacity="0.3" />
                    </filter>
                </defs>

                {/* background grid */}
                {[0.25, 0.5, 0.75, 1].map(t => (
                    <line key={t}
                        x1={sx} y1={BASE_Y - t * MAX_BH} x2={sx + totalW} y2={BASE_Y - t * MAX_BH}
                        stroke="rgba(16,185,129,0.1)" strokeWidth={t === 1 ? 1.2 : 0.6}
                        strokeDasharray={t < 1 ? "4,4" : undefined} />
                ))}

                {dist.map(({ a, pct }, i) => {
                    const bh = Math.max((pct / maxPct) * MAX_BH, 5);
                    const x = sx + i * (BAR_W + GAP);
                    const cx = x + BAR_W / 2;
                    const isMain = a === age;
                    const isHov = hoverIdx === i;
                    const co2Val = trees > 0 ? carbonForAge(a, trees).co2 : 0;

                    const ttW = 102, ttH = 46;
                    const ttLeft = Math.min(Math.max(cx - ttW / 2, 2), W - ttW - 2);
                    const ttTop = BASE_Y - bh - ttH - 16;

                    return (
                        <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }}>
                            {/* hover glow bg */}
                            {(isMain || isHov) && (
                                <rect x={x - 4} y={BASE_Y - bh - 4} width={BAR_W + 8} height={bh + 4}
                                    rx={10} fill={isHov ? "rgba(16,185,129,0.12)" : "rgba(45,158,95,0.07)"} />
                            )}
                            {/* bar */}
                            <rect x={x} y={BASE_Y - bh} width={BAR_W} height={bh} rx={8}
                                fill={isMain ? "url(#barGradMain)" : isHov ? "rgba(16,185,129,0.45)" : "rgba(16,185,129,0.18)"}
                                filter={isMain ? "url(#barShadow)" : undefined}
                                style={{ transition: "fill 0.15s" }} />
                            {/* % label above bar */}
                            <text x={cx} y={BASE_Y - bh - 8} textAnchor="middle"
                                fontSize={isMain ? (isMobile ? 22 : 21) : (isMobile ? 18 : 16)}
                                fontWeight={isMain ? "900" : isHov ? "700" : "500"}
                                fill={isMain ? "#065f46" : isHov ? "#059669" : "#94a3b8"}>
                                {pct}%
                            </text>
                            {/* age labels removed per user request */}

                            {/* tooltip */}
                            {isHov && (
                                <g pointerEvents="none">
                                    <rect x={ttLeft} y={ttTop} width={ttW} height={ttH + 10} rx={9} fill="#064e3b" opacity={0.95} />
                                    <text x={ttLeft + ttW / 2} y={ttTop + 18} textAnchor="middle" fontSize={12} fill="#6ee7b7" fontWeight="600">
                                        อายุ {a} ปี · {pct}%
                                    </text>
                                    <text x={ttLeft + ttW / 2} y={ttTop + 38} textAnchor="middle" fontSize={15} fill="#fff" fontWeight="800">
                                        {co2Val > 0 ? `${co2Val.toLocaleString("th-TH", { maximumFractionDigits: 0 })} tCO₂` : "—"}
                                    </text>
                                    <polygon points={`${cx - 5},${ttTop + ttH} ${cx + 5},${ttTop + ttH} ${cx},${ttTop + ttH + 6}`} fill="#064e3b" opacity={0.95} />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ── SVG: Carbon forecast line chart with hover ────────────────────────────
function ForecastChart({ pts, isMobile }: { pts: Array<{ yearBE: number; co2: number }>; isMobile?: boolean }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const W = isMobile ? 360 : 550, H = isMobile ? 230 : 250, PL = 12, PR = isMobile ? 55 : 75, PT = isMobile ? 24 : 30, PB = isMobile ? 38 : 42;
    const iW = W - PL - PR, iH = H - PT - PB;
    const vals = pts.map(p => p.co2);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const rng = maxV - minV || 1;

    const svgPts = pts.map((d, i) => ({
        x: PL + (i / Math.max(pts.length - 1, 1)) * iW,
        y: PT + (1 - (d.co2 - minV) / rng) * iH,
        ...d,
    }));
    const line = svgPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fillPath = `${PL},${PT + iH} ${line} ${(PL + iW).toFixed(1)},${PT + iH}`;
    const hp = hoverIdx !== null ? svgPts[hoverIdx] : null;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", overflow: "visible" }}>
            <defs>
                <linearGradient id="fcAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
                </linearGradient>
                <filter id="ptShadow">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#059669" floodOpacity="0.4" />
                </filter>
            </defs>

            {/* Grid */}
            {[0, 0.5, 1].map(t => (
                <line key={t} x1={PL} y1={PT + t * iH} x2={PL + iW} y2={PT + t * iH}
                    stroke="rgba(45,158,95,0.1)" strokeWidth={t === 0 || t === 1 ? 1 : 0.5}
                    strokeDasharray={t === 0.5 ? "4,4" : undefined} />
            ))}

            {/* Hover vertical guide */}
            {hp && (
                <line x1={hp.x} y1={PT} x2={hp.x} y2={PT + iH}
                    stroke="rgba(16,185,129,0.35)" strokeWidth={1.5} strokeDasharray="3,3" />
            )}

            {/* Area */}
            <polygon points={fillPath} fill="url(#fcAreaGrad)" />

            {/* Line */}
            <polyline points={line} fill="none" stroke="#0d9488" strokeWidth={2.2}
                strokeLinejoin="round" strokeLinecap="round" />

            {/* Invisible wide hit targets per segment */}
            {svgPts.map((p, i) => (
                <rect key={i}
                    x={i === 0 ? PL : (svgPts[i - 1].x + p.x) / 2}
                    y={PT}
                    width={i === 0
                        ? (svgPts[1] ? (svgPts[1].x + p.x) / 2 - PL : iW)
                        : i === svgPts.length - 1
                            ? (PL + iW) - (svgPts[i - 1].x + p.x) / 2
                            : (p.x - svgPts[i - 1].x)}
                    height={iH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{ cursor: "crosshair" }}
                />
            ))}

            {/* Data points */}
            {svgPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5.5 : 3.5}
                    fill={hoverIdx === i ? "#10b981" : "#ffffff"}
                    stroke="#059669" strokeWidth={2}
                    filter={hoverIdx === i ? "url(#ptShadow)" : undefined}
                    style={{ transition: "r 0.15s ease" }} />
            ))}

            {/* Year labels */}
            {svgPts.map(p => (
                <text key={p.yearBE} x={p.x} y={H - 12} textAnchor="middle" fontSize={isMobile ? 14 : 13} fill="#94a3b8">
                    {p.yearBE}
                </text>
            ))}

            {/* Y axis labels */}
            <text x={PL + iW + 8} y={PT + 4} fontSize={isMobile ? 12 : 11} fill="#6b9e7e" textAnchor="start">
                {Math.round(maxV).toLocaleString()}
            </text>
            <text x={PL + iW + 8} y={PT + iH + 4} fontSize={isMobile ? 12 : 11} fill="#6b9e7e" textAnchor="start">
                {Math.round(minV).toLocaleString()}
            </text>

            {/* Hover tooltip */}
            {hp && (() => {
                const ttW = 96, ttH = 42;
                const ttX = Math.min(Math.max(hp.x - ttW / 2, PL), PL + iW - ttW);
                const ttY = hp.y - ttH - 10;
                return (
                    <g pointerEvents="none">
                        <rect x={ttX} y={ttY} width={ttW + 10} height={ttH + 10} rx={7} fill="#0f1f17" opacity={0.93} />
                        <text x={ttX + (ttW + 10) / 2} y={ttY + 16} textAnchor="middle" fontSize={11} fill="#6ee7b7" fontWeight="600">
                            พ.ศ. {hp.yearBE}
                        </text>
                        <text x={ttX + (ttW + 10) / 2} y={ttY + 34} textAnchor="middle" fontSize={13} fill="#ffffff" fontWeight="700">
                            {hp.co2.toLocaleString("th-TH", { maximumFractionDigits: 0 })} tCO₂
                        </text>
                        <polygon
                            points={`${hp.x - 5},${ttY + ttH} ${hp.x + 5},${ttY + ttH} ${hp.x},${ttY + ttH + 6}`}
                            fill="#0f1f17" opacity={0.93}
                        />
                    </g>
                );
            })()}
        </svg>
    );
}

// ── Main component ─────────────────────────────────────────────────────────
export function ParcelResultsPanel({
    searchRunning,
    searchErr,
    searchCount,
    searchTruncated,
    parcelFeatures,
    userDisplayName = "",
    drawnGeometry = null,
    onFlyTo,
    onReset,
    onBack,
    onCancel,
    currentStep,
    onStepChange,
    selectedMapPlotIndex = "total",
    onMapPlotSelected,
    onDeleteParcel,
    onDrawMore,
    isDrawing,
    onFinishDraw,
    onCancelDraw,
}: Props) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
    const [plotTabs, setPlotTabs] = useState<Record<number, PlotTab>>({});
    const [forecastYrs, setForecastYrs] = useState<Record<number, ForecastYr>>({});
    const [summaryFcYrs, setSummaryFcYrs] = useState<ForecastYr>(7);
    const { user } = useAuth();
    const router = useRouter();

    const plots = useMemo(() => parcelFeatures.map(computePlot), [parcelFeatures]);
    const totalArea = useMemo(() => plots.reduce((s, p) => s + p.areaRai, 0), [plots]);
    const totalCO2 = useMemo(() => plots.reduce((s, p) => s + p.co2, 0), [plots]);
    const summaryPts = useMemo(() => summaryForecast(plots, summaryFcYrs), [plots, summaryFcYrs]);
    const dominantProvince = useMemo(() => {
        const freq: Record<string, number> = {};
        plots.forEach(p => { if (p.province) freq[p.province] = (freq[p.province] ?? 0) + 1; });
        return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }, [plots]);

    // Responsive detection
    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);


    // Step 3 form
    // Sub-step tracking for Step 3 results view
    // (Formerly used for a separate save form, now removed for direct saving)
    const [subStep, setSubStep] = useState<SubStep>("carbon");

    const searchParams = useSearchParams();
    const initialProjectName = searchParams.get("project") || "";
    const [projectName, setProjectName] = useState(initialProjectName);
    const [ownerName, setOwnerName] = useState(userDisplayName);
    const [province, setProvince] = useState("");
    const [saveState, setSaveState] = useState<"idle" | "saving" | "done">("idle");
    const [showInputDetails, setShowInputDetails] = useState(false);
    const [plotForms, setPlotForms] = useState<PlotFormData[]>([]);
    const [carbonResults, setCarbonResults] = useState<CarbonResult[]>([]);
    const [backendResponses, setBackendResponses] = useState<EstimationResponse[] | null>(null);
    const [processingCarbon, setProcessingCarbon] = useState(false);
    const [carbonErr, setCarbonErr] = useState<string | null>(null);

    // Initialize plotForms automatically when ready
    useEffect(() => {
        if (plots.length !== plotForms.length) {
            setPlotForms(prev => {
                if (plots.length > prev.length) {
                    const next = [...prev];
                    for (let i = next.length; i < plots.length; i++) {
                        const feat = parcelFeatures[i];
                        const props = feat?.properties as any || {};
                        const initialLU = { A: true, A302: true };
                        next.push({
                            plantStatus: "",
                            plantYear: props.plantYearBE ? String(props.plantYearBE) : "",
                            treeCount: props.trees ? String(props.trees) : "",
                            variety: props.variety || "",
                            spacing: props.spacing || "",
                            luChecked: initialLU,
                            luMockData: generateMockLU(plots[i].areaRai, initialLU)
                        });
                    }
                    return next;
                } else {
                    return prev.slice(0, plots.length);
                }
            });
        }
    }, [plots, plotForms.length, parcelFeatures]);

    const handleProcessCarbon = async () => {
        setCarbonErr(null);
        setProcessingCarbon(true);
        const CURRENT_BE_NOW = new Date().getFullYear() + 543;
        const SUPPORTED_CLONES = ["RRIM 600", "RRIT 251"];

        const polygons: PlantationPolygon[] = parcelFeatures.map((feat, i) => {
            const form = plotForms[i];
            const props = (feat.properties ?? {}) as Record<string, unknown>;
            const plantYearBE = form?.plantYear ? parseInt(form.plantYear) : 0;
            return {
                id: String(props.id || `plot-${i + 1}`),
                geometry: feat.geometry,
                year_of_planting: plantYearBE > 0 ? plantYearBE - 543 : null,
                rubber_clone: (form?.variety && SUPPORTED_CLONES.includes(form.variety)) ? form.variety : null,
                tree_count: form?.treeCount ? (parseInt(form.treeCount) || null) : null,
                spacing_system: form?.spacing || null,
            };
        });

        try {
            const responses = await estimateCarbon(polygons);
            setBackendResponses(responses);

            const results: CarbonResult[] = responses.map((resp, i) => {
                const profile = resp.carbon_profile ?? [];
                const form = plotForms[i];
                const plantYearBE = form?.plantYear ? parseInt(form.plantYear) : 0;
                const startAge = plantYearBE > 0 ? CURRENT_BE_NOW - plantYearBE : (plots[i]?.age || 5);
                const finalPlantYear = plantYearBE > 0 ? plantYearBE : (plots[i]?.plantYearBE || CURRENT_BE_NOW - startAge);
                const userTrees = form?.treeCount ? parseInt(form.treeCount) : 0;
                const finalTrees = userTrees > 0 ? userTrees : Math.round((plots[i]?.areaRai || 1) * 76);
                return {
                    plotIdx: i,
                    age: startAge,
                    plantYearBE: finalPlantYear,
                    trees: finalTrees,
                    spacing: form?.spacing || "2.5x8",
                    variety: form?.variety || "RRIM 600",
                    co2Now: profile[0]?.total_carbon_tCO2e ?? 0,
                    source: "backend" as const,
                };
            });
            setCarbonResults(results);
            if (onMapPlotSelected) onMapPlotSelected("total");
            setSubStep("carbon");
            onStepChange(3);
        } catch (err) {
            setCarbonErr(err instanceof Error ? err.message : String(err));
        } finally {
            setProcessingCarbon(false);
        }
    };


    // Removed: if (!(searchRunning || searchErr || searchCount !== null)) return null;

    const handleSave = async (overrideResults?: CarbonResult[]) => {
        const resultsToSave = overrideResults || carbonResults;
        const hasCarbonResults = resultsToSave.length > 0;

        setSaveState("saving");

        await new Promise(r => setTimeout(r, 900));
        try {
            if (!user) return;
            const key = `user_saved_plots_${user.id}`;
            const existing = JSON.parse(localStorage.getItem(key) || "[]");
            const CURRENT_BE_NOW = new Date().getFullYear() + 543;
            const newPlots = plots.map((p, i) => {
                const feat = parcelFeatures[i];
                const props = (feat?.properties || {}) as any;
                const cr = resultsToSave[i];
                const form = plotForms[i];

                const userPlantYear = form?.plantYear ? parseInt(form.plantYear) : 0;
                const userTrees = form?.treeCount ? parseInt(form.treeCount) : 0;

                const age = cr?.age ?? (userPlantYear > 0 ? (CURRENT_BE_NOW - userPlantYear) : 0);
                const trees = cr?.trees ?? (userTrees > 0 ? userTrees : 0);
                const spacing = cr?.spacing || form?.spacing || "";
                const finalPlantYear = cr?.plantYearBE ?? (userPlantYear > 0 ? userPlantYear : 0);

                // If saved directly without processing, set carbon to 0
                const co2 = hasCarbonResults ? (cr?.co2Now ?? 0) : 0;

                return {
                    id: props.id || Math.random().toString(36).substring(7),
                    userId: user.id,
                    name: projectName || props.farm_name || "แปลงยางใหม่",
                    areaRai: p.areaRai,
                    carbonTotal: co2,
                    rubberAge: age,
                    plantYearBE: finalPlantYear,
                    trees,
                    variety: form?.variety || cr?.variety || "",
                    spacing,
                    confidence: p.confidence,
                    ownerName: ownerName || props.owner_name || "",
                    province: province || dominantProvince,
                    date: new Date().toISOString(),
                    geojson: feat?.geometry || null,
                    boundaryGeojson: drawnGeometry || null,
                    forecast: hasCarbonResults ? {
                        yr3: carbonCo2(age + 3, trees, spacing),
                        yr5: carbonCo2(age + 5, trees, spacing),
                        yr7: carbonCo2(age + 7, trees, spacing),
                    } : { yr3: 0, yr5: 0, yr7: 0 },
                };
            });
            const newPlotIds = new Set(newPlots.map(p => p.id));
            const filteredExisting = existing.filter((p: any) => !newPlotIds.has(p.id));
            localStorage.setItem(key, JSON.stringify([...newPlots, ...filteredExisting]));
            const globalKey = "global_saved_plots";
            const globalExisting = JSON.parse(localStorage.getItem(globalKey) || "[]");
            const filteredGlobalExisting = globalExisting.filter((p: any) => !newPlotIds.has(p.id));
            localStorage.setItem(globalKey, JSON.stringify([...newPlots, ...filteredGlobalExisting]));
        } catch (e) { console.error(e); }
        setSaveState("done");
        setTimeout(() => router.push("/my-plots"), 1500);
    };


    // ── Loading ────────────────────────────────────────────────────────────
    if (searchRunning) {
        return (
            <div className="prp-shell">
                <div className="s1-results-loading">
                    <div className="s1-spin" />
                    <span>กำลังค้นหาแปลงที่ทับซ้อน...</span>
                </div>
                {onCancel && (
                    <button onClick={onCancel} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 8, border: "1px solid #dc3545", background: "transparent", color: "#dc3545", fontSize: 13, cursor: "pointer", fontWeight: 500, margin: "16px auto 0" }}>
                        <i className="bi bi-x-circle" /> ยกเลิกการประมวลผล
                    </button>
                )}
            </div>
        );
    }

    // ── Error ──────────────────────────────────────────────────────────────
    if (searchErr) {
        return (
            <div className="prp-shell">
                <div className="s1-results-error">
                    <i className="bi bi-exclamation-triangle me-2" />{searchErr}
                </div>
                {onBack && (
                    <button className="mds-btn mds-btn-soft" style={{ marginTop: 12 }} onClick={onBack}>
                        <i className="bi bi-arrow-left me-1" /> กลับขั้นตอนที่ 1
                    </button>
                )}
            </div>
        );
    }

    // Removed: if (searchCount === null) return null;

    // ── Step 2: Data entry form ────────────────────────────────
    if (currentStep === 2) {
        const updateForm = (idx: number, field: keyof PlotFormData, val: string) => {
            setPlotForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: val } : f));
        };
        return (
            <div className="prp-shell">


                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div className="prp-header-block" style={{ marginBottom: 0 }}>
                        <div className="prp-main-title" style={{ fontSize: isMobile ? 16 : 18 }}>
                            <i className="bi bi-pencil-square me-2" style={{ color: "#10b981" }} />กรอกข้อมูลแปลง
                        </div>
                        <div className="prp-subtitle">กรอกหรือข้ามได้ — ข้อมูลจะนำไปประมวลผลคาร์บอน</div>
                    </div>
                    {onBack && (
                        <div
                            onClick={onBack}
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#64748b",
                                cursor: "pointer",
                                background: "rgba(100,116,139,0.08)",
                                padding: "6px 10px",
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                transition: "all 0.2s"
                            }}
                        >
                            <i className="bi bi-arrow-left-circle" /> ย้อนกลับ
                        </div>
                    )}
                </div>

                {/* Project name — shared */}
                <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", borderRadius: 14, padding: isMobile ? "14px 14px" : "16px 20px", marginBottom: 16, border: "1px solid rgba(16,185,129,0.18)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <i className="bi bi-folder2-open" /> ชื่อโครงการ  <span style={{ color: "#ef4444" }}>*</span>
                    </div>
                    <input className="prp-input" style={{ marginBottom: 0 }} placeholder="เช่น โครงการที่1" value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>

                {/* Summary of drawn parcels */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>
                        แปลงที่วาดแล้ว ({plots.length})
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>
                        {totalArea.toFixed(2)} ไร่
                    </div>
                </div>

                {/* Per-plot fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {plots.map((p, i) => {
                        const form = plotForms[i] || { plantYear: "", treeCount: "", variety: "", spacing: "2.5*8" };
                        return (
                            <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(16,185,129,0.15)", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                                {/* Plot header */}
                                <div
                                    onClick={() => {
                                        setExpandedIdx(expandedIdx === i ? null : i);
                                        if (parcelFeatures[i]) {
                                            onFlyTo(parcelFeatures[i]);
                                            onMapPlotSelected?.(i);
                                        }
                                    }}
                                    style={{
                                        background: "linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.04))",
                                        padding: "10px 14px",
                                        borderBottom: "none",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        cursor: "pointer",
                                        userSelect: "none"
                                    }}
                                >
                                    <div style={{ pointerEvents: 'none', width: 28, height: 28, borderRadius: 8, background: "#10b981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
                                    <div style={{ pointerEvents: 'none', flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>แปลงที่ {i + 1}</div>
                                        {p.areaRai > 0 && (
                                            <div style={{ fontSize: 11, color: "#64748b" }}>{p.areaRai.toFixed(2)} ไร่</div>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm(`ลบแปลงที่ ${i + 1} หรือไม่?`)) {
                                                    onDeleteParcel?.(i);
                                                }
                                            }}
                                            style={{ border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: 4 }}
                                        >
                                            <i className="bi bi-trash" />
                                        </button>
                                        <span className={`bi bi-chevron-${expandedIdx === i ? 'up' : 'down'}`} style={{ pointerEvents: 'none', color: "#64748b", fontSize: 14 }} />
                                    </div>
                                </div>
                                {expandedIdx === i && (
                                    <>
                                        {/* Status Selection */}
                                        <div style={{ padding: isMobile ? "16px 16px 0" : "20px 24px 0", background: "#fff" }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                <i className="bi bi-info-circle" style={{ color: "#10b981" }} /> สถานะแปลง
                                            </div>
                                            <div style={{ display: "flex", gap: 16 }}>
                                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                                    <input type="radio" name={`status-${i}`} value="new" checked={form.plantStatus === "new"} onChange={() => { updateForm(i, "plantStatus", "new"); updateForm(i, "plantYear", ""); }} />
                                                    เริ่มปลูก
                                                </label>
                                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                                                    <input type="radio" name={`status-${i}`} value="old" checked={form.plantStatus === "old"} onChange={() => { updateForm(i, "plantStatus", "old"); updateForm(i, "plantYear", ""); }} />
                                                    ปลูกมาแล้ว
                                                </label>
                                            </div>
                                        </div>

                                        {/* Fields grid */}
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                                            gap: "16px 20px",
                                            padding: isMobile ? "16px" : "20px 24px",
                                            background: "#fff"
                                        }}>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-calendar-event" style={{ color: "#10b981" }} /> ปีที่ปลูก (พ.ศ.)
                                                </div>
                                                <select
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                    value={form.plantYear}
                                                    onChange={e => updateForm(i, "plantYear", e.target.value)}
                                                    disabled={!form.plantStatus}
                                                >
                                                    <option value="">— เลือกปีที่ปลูก —</option>
                                                    {(form.plantStatus === "new" ? NEW_YEAR_OPTIONS : form.plantStatus === "old" ? OLD_YEAR_OPTIONS : []).map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </div>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-tags" style={{ color: "#10b981" }} /> พันธุ์ยาง
                                                </div>
                                                <select
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                    value={form.variety}
                                                    onChange={e => updateForm(i, "variety", e.target.value)}
                                                >
                                                    <option value="">— เลือกสายพันธุ์ยาง —</option>
                                                    {VARIETY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-tree" style={{ color: "#10b981" }} /> จำนวนต้นยาง
                                                </div>
                                                <input
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                    type="number"
                                                    placeholder="ระบุจำนวนต้น เช่น 70"
                                                    value={form.treeCount}
                                                    onChange={e => updateForm(i, "treeCount", e.target.value)}
                                                />
                                            </div>
                                            <div className="prp-field-group">
                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <i className="bi bi-arrows-expand" style={{ color: "#10b981" }} /> ระยะปลูก (ม.)
                                                </div>
                                                <select
                                                    className="prp-input"
                                                    style={{ marginBottom: 0, height: 46, borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "0 12px" }}
                                                    value={form.spacing}
                                                    onChange={e => updateForm(i, "spacing", e.target.value)}
                                                >
                                                    <option value="">— เลือกระยะปลูก —</option>
                                                    {SPACING_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Land Use Checkboxes */}
                                        <div style={{ padding: isMobile ? "0 16px 16px" : "0 24px 20px", background: "#fff" }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                                                <i className="bi bi-layers" style={{ color: "#10b981" }} /> ชั้นข้อมูลการใช้ประโยชน์ที่ดิน (กรมพัฒนาที่ดิน)
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                                                {[
                                                    { id: "F", label: "F พื้นที่ป่าไม้", fixed: false },
                                                    { id: "A", label: "A พื้นที่เกษตรกรรม", fixed: true },
                                                    { id: "A302", label: "A302 ยางพารา (หมวดย่อย A)", fixed: true, indent: true },
                                                    { id: "A303", label: "A303 ปาล์มน้ำมัน (หมวดย่อย A)", fixed: false, indent: true },
                                                    { id: "A304", label: "A304 ไม้ผล (หมวดย่อย A)", fixed: false, indent: true },
                                                    { id: "M", label: "M พื้นที่อื่นๆ", fixed: false },
                                                    { id: "U", label: "U พื้นที่สิ่งปลูกสร้าง", fixed: false, disabled: true },
                                                    { id: "W", label: "W แหล่งน้ำ", fixed: false, disabled: true },
                                                ].map(lu => {
                                                    const isChecked = form.luChecked?.[lu.id] || false;
                                                    const mockData = form.luMockData?.[lu.id];
                                                    return (
                                                        <label key={lu.id} style={{
                                                            display: "flex", alignItems: "center", gap: 8, cursor: lu.disabled || lu.fixed ? "not-allowed" : "pointer",
                                                            opacity: lu.disabled ? 0.5 : 1, paddingLeft: lu.indent ? 24 : 0
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                disabled={lu.fixed || lu.disabled}
                                                                style={{ accentColor: lu.disabled ? "#000" : "#10b981", width: 16, height: 16 }}
                                                                onChange={(e) => {
                                                                    const newChecked = { ...form.luChecked, [lu.id]: e.target.checked };
                                                                    setPlotForms(prev => prev.map((f, idx) => idx === i ? { ...f, luChecked: newChecked, luMockData: generateMockLU(p.areaRai, newChecked) } : f));
                                                                }}
                                                            />
                                                            <span style={{ flex: 1, color: lu.disabled ? "#000" : "#334155", fontWeight: isChecked ? 600 : 400 }}>{lu.label}</span>
                                                            <span style={{ color: (mockData && mockData.rai > 0) ? "#059669" : "#94a3b8", fontSize: 12, fontWeight: 700 }}>
                                                                {(mockData?.rai || 0).toFixed(2)} ไร่ <span style={{ opacity: 0.7, fontSize: 11 }}>({mockData?.pct || 0}%)</span>
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>

                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Drawing placeholder card */}
                {isDrawing && (
                    <div style={{
                        background: "rgba(16,185,129,0.03)",
                        border: "2px dashed rgba(16,185,129,0.4)",
                        borderRadius: 14,
                        padding: "24px 16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 16,
                    }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                            <div className="mds-dot-pulse" style={{ background: "#10b981", width: 10, height: 10, margin: 0 }} />
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>กำลังวาดแปลงใหม่บนแผนที่...</div>
                            <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>คลิกบนแผนที่เพื่อเพิ่มจุดขอบเขต หรือดับเบิลคลิกเพื่อปิดแปลง</div>
                        </div>
                        <div style={{ display: "flex", gap: 12, width: "100%" }}>
                            <button
                                onClick={onCancelDraw}
                                style={{ flex: 1, background: "#fff", border: "1px solid #cbd5e1", color: "#64748b", padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                            >
                                <i className="bi bi-x-circle me-1" /> ยกเลิก
                            </button>
                            <button
                                onClick={onFinishDraw}
                                style={{ flex: 1, background: "linear-gradient(135deg,#10b981,#059669)", border: "none", color: "#fff", padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 10px rgba(16,185,129,0.2)" }}
                            >
                                <i className="bi bi-check-circle me-1" /> วาดเสร็จแล้ว
                            </button>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                {carbonErr && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, fontSize: 12, color: "#dc2626", display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <i className="bi bi-exclamation-triangle-fill" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{carbonErr}</span>
                    </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
                    <button
                        className="prp-btn-primary"
                        onClick={() => { void handleProcessCarbon(); }}
                        disabled={!projectName.trim() || processingCarbon}
                        style={{
                            background: (projectName.trim() && !processingCarbon) ? "linear-gradient(135deg,#10b981,#059669)" : "#cbd5e1",
                            cursor: (projectName.trim() && !processingCarbon) ? "pointer" : "not-allowed"
                        }}
                    >
                        {processingCarbon ? (
                            <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", marginRight: 8 }} />กำลังประมวลผล...</>
                        ) : (
                            <><i className="bi bi-graph-up-arrow me-2" />ประมวลผลคาร์บอน</>
                        )}
                    </button>
                    <button
                        className="prp-btn-primary"
                        onClick={() => handleSave([])}
                        disabled={!projectName.trim() || saveState === "saving"}
                        style={{
                            background: projectName.trim() ? "linear-gradient(135deg,#0369a1,#0284c7)" : "#cbd5e1",
                            cursor: projectName.trim() ? "pointer" : "not-allowed"
                        }}
                    >
                        {saveState === "saving" ? (
                            <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", marginRight: 8 }} /> กำลังบันทึก...</>
                        ) : (
                            <><i className="bi bi-floppy-disk me-2" />บันทึกลงฐานข้อมูล</>
                        )}
                    </button>
                    {onDrawMore && !isDrawing && (
                        <button className="prp-btn-ghost" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }} onClick={onDrawMore}>
                            <i className="bi bi-pencil-square me-1" /> วาดแปลงเพิ่ม
                        </button>
                    )}

                </div>
            </div>
        );
    }

    // ── Step 3: Carbon Results & Save ────────────────────────────────
    if (currentStep === 3) {
        // ── sub: carbon results ──
        if (subStep === "carbon") {
            const isTotal = selectedMapPlotIndex === "total";
            const cr = typeof selectedMapPlotIndex === "number" ? carbonResults[selectedMapPlotIndex] : null;

            let pts: BarPoint[] = [];
            let summaryTotalCo2 = 0;
            let summaryTotalTrees = 0;

            if (isTotal && carbonResults.length > 0) {
                summaryTotalTrees = carbonResults.reduce((sum, c) => sum + c.trees, 0);
                summaryTotalCo2 = carbonResults.reduce((sum, c) => sum + c.co2Now, 0);

                if (backendResponses && backendResponses.length > 0) {
                    pts = aggregateProfiles(backendResponses, carbonResults.map(c => c.age));
                } else {
                    const CURRENT_BE = new Date().getFullYear() + 543;
                    const initialPlotCarbons = carbonResults.map(c => carbonCo2(c.age, c.trees, c.spacing));
                    const plotStates = carbonResults.map(c => ({ continuousAge: c.age }));
                    const N = plotStates.length;
                    for (let i = 0; i < 35; i++) {
                        const yearBE = CURRENT_BE + i;
                        let totalCo2 = 0, totalContinuousAge = 0, sumSqMargin = 0;
                        plotStates.forEach((state, idx) => {
                            const plotCo2 = carbonCo2(state.continuousAge, carbonResults[idx].trees, carbonResults[idx].spacing);
                            totalCo2 += plotCo2;
                            if (i > 0) {
                                const growth = plotCo2 - initialPlotCarbons[idx];
                                const factor = 0.05 + 0.002 * i;
                                const m = Math.max(0, growth * factor);
                                sumSqMargin += m * m;
                            }
                            totalContinuousAge += state.continuousAge;
                            state.continuousAge++;
                        });
                        const avgAge = Math.round(totalContinuousAge / N);
                        if (avgAge > 35) break;
                        pts.push({ age: avgAge, yearBE, co2: totalCo2, cycle: Math.floor(avgAge / CUT_AGE), cycleAge: avgAge, errorMargin: Math.sqrt(sumSqMargin) });
                    }
                }
            } else if (cr) {
                const plotIdx = selectedMapPlotIndex as number;
                const backendProfile = backendResponses?.[plotIdx]?.carbon_profile;
                pts = backendProfile
                    ? profileToBarPoints(backendProfile, cr.age)
                    : buildBarPoints(cr.age, cr.plantYearBE, cr.trees, cr.spacing);
            }

            return (
                <div className="prp-shell">
                    {/* New Integrated Header Design */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 12,
                        paddingBottom: 12,
                        borderBottom: "1px solid rgba(16,185,129,0.1)"
                    }}>
                        <div style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            background: "linear-gradient(135deg,#10b981,#059669)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            boxShadow: "0 3px 8px rgba(16,185,129,0.2)",
                            fontSize: 18
                        }}>
                            <i className={`bi bi-${isTotal ? "pie-chart-fill" : "geo-fill"}`} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                                {isTotal ? "สรุปผลคาร์บอนรวม" : `ผลคาร์บอน: แปลงที่ ${(selectedMapPlotIndex as number) + 1}`}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
                                {isTotal ? "ภาพรวมการคำนวณจากทุกแปลง" : "แสดงข้อมูลเฉพาะแปลงที่เลือก"}
                            </div>
                        </div>
                        {!isTotal && (
                            <div
                                onClick={() => onMapPlotSelected?.("total")}
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#059669",
                                    cursor: "pointer",
                                    padding: "6px 12px",
                                    borderRadius: 20,
                                    background: "rgba(16,185,129,0.08)",
                                    border: "1px solid rgba(16,185,129,0.2)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    transition: "all 0.2s"
                                }}
                            >
                                <i className="bi bi-arrow-left-circle-fill" />
                                กลับหน้ารวม
                            </div>
                        )}
                    </div>

                    {isTotal ? (
                        <>
                            {/* Total summary */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 10 }}>
                                {[
                                    { label: "คาร์บอนรวมปัจจุบัน", val: `${Math.round(summaryTotalCo2).toLocaleString()} tCO₂`, color: "#0d9488" },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</div>
                                        <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color }}>{val}</div>
                                    </div>
                                ))}
                            </div>
                            <CarbonBarChart pts={pts} isMobile={isMobile} narrowMode={!isMobile} />
                            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                                hover บนแท่งเพื่อดูรายละเอียด
                            </div>
                        </>
                    ) : cr ? (
                        <>
                            {/* Plot info summary */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 10 }}>
                                {[
                                    { label: "คาร์บอนปัจจุบัน", val: `${Math.round(cr.co2Now).toLocaleString()} tCO₂`, color: "#0d9488" },
                                ].map(({ label, val, color }) => (
                                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "8px 8px", textAlign: "center", border: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                                        <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color }}>{val}</div>
                                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{label}</div>
                                    </div>
                                ))}
                            </div>


                            {/* Bar chart */}
                            <CarbonBarChart pts={pts} isMobile={isMobile} narrowMode={!isMobile} />

                            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                                hover บนแท่งเพื่อดูรายละเอียด · แนวโน้มคาร์บอนรายแปลง
                            </div>
                        </>
                    ) : null}

                    {/* Input Details Summary (Collapsible) */}
                    <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <div
                            onClick={() => setShowInputDetails(!showInputDetails)}
                            style={{
                                padding: "12px 14px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                background: showInputDetails ? "rgba(14,165,233,0.04)" : "transparent"
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
                                <i className="bi bi-file-text" style={{ color: "#0ea5e9" }} /> ข้อมูลที่ใช้ประมวลผล
                            </div>
                            <i className={`bi bi-chevron-${showInputDetails ? "up" : "down"}`} style={{ fontSize: 12, color: "#64748b" }} />
                        </div>

                        {showInputDetails && (
                            <div style={{ padding: "0 14px 14px", fontSize: 12, color: "#475569", borderTop: "1px solid rgba(226,232,240,0.6)" }}>
                                <div style={{ paddingTop: 10 }}>
                                    <div><strong>ชื่อโครงการ:</strong> {projectName || "-"}</div>
                                    <div><strong>พื้นที่รวม:</strong> {totalArea.toFixed(2)} ไร่</div>
                                    <div style={{ marginTop: 8 }}><strong>รายละเอียดแปลง:</strong></div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                                        {plots.map((p, i) => {
                                            if (!isTotal && selectedMapPlotIndex !== i) return null;
                                            const f = plotForms[i];
                                            const crInfo = carbonResults[i];
                                            if (!f || !crInfo) return null;
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => {
                                                        if (parcelFeatures[i]) {
                                                            onFlyTo(parcelFeatures[i]);
                                                            onMapPlotSelected?.(i);
                                                        }
                                                    }}
                                                    style={{ padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,0.05)", cursor: "pointer" }}
                                                >
                                                    <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>แปลงที่ {i + 1} ({p.areaRai.toFixed(2)} ไร่)</div>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: "#64748b" }}>
                                                        <div>• ปีที่ปลูก: พ.ศ. {crInfo.plantYearBE}</div>
                                                        <div>• พันธุ์ยาง: {crInfo.variety}</div>
                                                        <div>• จำนวนต้น: {crInfo.trees} ต้น</div>
                                                        <div>• ระยะปลูก: {crInfo.spacing} ม.</div>
                                                    </div>
                                                    {f.luMockData && Object.keys(f.luMockData).length > 0 && (
                                                        <div style={{ marginTop: 4, fontSize: 11, color: "#10b981", display: "flex", flexWrap: "wrap", gap: 6 }}>
                                                            {Object.entries(f.luMockData).map(([k, v]) => (
                                                                <span key={k}>{k}: {v.pct}%</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                        <button
                            className="prp-btn-primary"
                            onClick={() => handleSave()}
                            disabled={!projectName.trim() || saveState === "saving"}
                            style={{ background: "linear-gradient(135deg,#0369a1,#0284c7)" }}
                        >
                            {saveState === "saving" ? (
                                <><span className="s1-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", marginRight: 8 }} /> กำลังบันทึก...</>
                            ) : saveState === "done" ? (
                                <><i className="bi bi-check-circle-fill me-2" />บันทึกสำเร็จ!</>
                            ) : (
                                <><i className="bi bi-floppy-disk me-2" />บันทึกผลลงฐานข้อมูล</>
                            )}
                        </button>
                        <button className="prp-btn-ghost" onClick={() => onStepChange(2)}>← กลับแก้ไขข้อมูล</button>
                        <button className="prp-btn-text" onClick={onReset}><i className="bi bi-x-circle me-1" />ไม่บันทึก</button>
                    </div>
                </div>
            );
        }
    }

    return null;
}
