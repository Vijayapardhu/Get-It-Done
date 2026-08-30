import { Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import { AuthProvider } from "./lib/AuthContext"
import { Layout } from "./components/layout/Layout"
import { LoadingScreen } from "./components/ui/LoadingScreen"
import { Login } from "./pages/Login"
import { NotFound } from "./pages/NotFound"
import { Overview } from "./pages/Overview"
import { Operations } from "./pages/Operations"
import { Workforce } from "./pages/Workforce"
import { Catalogue } from "./pages/Catalogue"
import { CategoryCreate } from "./pages/CategoryCreate"
import { CategoryView } from "./pages/CategoryView"
import { ServiceView } from "./pages/ServiceView"
import { ServiceForm } from "./pages/ServiceForm"
import { ZoneManagement } from "./pages/ZoneManagement"
import { Pricing } from "./pages/Pricing"
import { PricingRules } from "./pages/PricingRules"
import { FederationFinance } from "./pages/FederationFinance"
import { Refunds } from "./pages/Refunds"
import { Settlements } from "./pages/Settlements"
import { Customers } from "./pages/Customers"
import { Support } from "./pages/Support"
import { SupportTicketDetail } from "./pages/SupportTicketDetail"
import { Insight } from "./pages/Insight"
import { Organisation } from "./pages/Organisation"
import { System } from "./pages/System"
import { Settings } from "./pages/Settings"
import { Societies } from "./pages/Societies"
import { SocietyDetail } from "./pages/SocietyDetail"
import { SocietyPerformance } from "./pages/SocietyPerformance"
import { RegionalDemand } from "./pages/RegionalDemand"
import { AiInsights } from "./pages/AiInsights"
import { Emergencies } from "./pages/Emergencies"
import { AuditLog } from "./pages/AuditLog"
import { Reports } from "./pages/Reports"
import { NotificationTemplates } from "./pages/NotificationTemplates"
import { DemandForecast } from "./pages/DemandForecast"
import { WorkforceAllocation } from "./pages/WorkforceAllocation"
import { CreateSociety } from "./pages/CreateSociety"
import { SocietyDashboard } from "./pages/SocietyDashboard"
import { SocietyOnboarding } from "./pages/SocietyOnboarding"
import { FederationTerritories } from "./pages/FederationTerritories"
import { UnassignedRequests } from "./pages/UnassignedRequests"

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="operations" element={<Operations />} />
            <Route path="emergencies" element={<Emergencies />} />
            <Route path="workforce" element={<Workforce />} />
            <Route path="societies" element={<Societies />} />
            <Route path="societies/create" element={<CreateSociety />} />
            <Route path="societies/:societyId" element={<SocietyDetail />} />
            <Route path="societies/:societyId/dashboard" element={<SocietyDashboard />} />
            <Route path="onboarding" element={<SocietyOnboarding />} />
            <Route path="territories" element={<FederationTerritories />} />
            <Route path="unassigned" element={<UnassignedRequests />} />
            <Route path="society-performance" element={<SocietyPerformance />} />
            <Route path="regional-demand" element={<RegionalDemand />} />
            <Route path="ai-insights" element={<AiInsights />} />
            <Route path="forecast" element={<DemandForecast />} />
            <Route path="allocation" element={<WorkforceAllocation />} />
            <Route path="catalogue" element={<Catalogue />} />
            <Route path="categories/new" element={<CategoryCreate />} />
            <Route path="categories/:categoryName" element={<CategoryView />} />
            <Route path="services/new" element={<ServiceForm />} />
            <Route path="services/:serviceId" element={<ServiceView />} />
            <Route path="services/:serviceId/edit" element={<ServiceForm />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="pricing/rules" element={<PricingRules />} />
            <Route path="zones" element={<ZoneManagement />} />
            <Route path="finance" element={<FederationFinance />} />
            <Route path="refunds" element={<Refunds />} />
            <Route path="settlements" element={<Settlements />} />
            <Route path="customers" element={<Customers />} />
            <Route path="support" element={<Support />} />
            <Route path="support/:ticketId" element={<SupportTicketDetail />} />
            <Route path="insight" element={<Insight />} />
            <Route path="organisation" element={<Organisation />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="reports" element={<Reports />} />
            <Route path="notifications" element={<NotificationTemplates />} />
            <Route path="system" element={<System />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
