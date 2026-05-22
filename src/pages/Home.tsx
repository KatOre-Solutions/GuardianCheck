import React from "react";
import { Link } from "react-router-dom";
import { Shield, QrCode, ClipboardCheck, Users, ArrowRight, CheckCircle2, Star, Zap, Globe, Heart } from "lucide-react";
import { motion } from "motion/react";
import WhatsAppSupport from "../components/WhatsAppSupport";

export default function Home() {
  const features = [
    {
      icon: <QrCode className="h-6 w-6 text-primary" />,
      title: "QR Code Check-In",
      description: "Fast and secure check-in using unique QR codes for every child."
    },
    {
      icon: <ClipboardCheck className="h-6 w-6 text-green-600" />,
      title: "Secure Pickup",
      description: "Verify authorized guardians with unique QR codes and visual confirmation."
    },
    {
      icon: <Users className="h-6 w-6 text-purple-600" />,
      title: "Room Management",
      description: "Assign children to specific rooms and track capacity in real-time."
    },
    {
      icon: <CheckCircle2 className="h-6 w-6 text-orange-600" />,
      title: "Attendance Reports",
      description: "Detailed analytics and history for every event and child."
    }
  ];

  const pricing = [
    {
      name: "Starter",
      price: "R249",
      description: "Perfect for small churches starting out.",
      features: ["20 Users", "50 Children", "1 Active Room", "QR Check-In", "Basic Reports"],
      cta: "Start Free Trial",
      highlight: false
    },
    {
      name: "Growth",
      price: "R499",
      description: "Ideal for growing congregations.",
      features: ["50 Users", "150 Children", "Unlimited Rooms", "Advanced Reports", "Guardian Management"],
      cta: "Start Free Trial",
      highlight: true
    },
    {
      name: "Professional",
      price: "R999",
      description: "Complete solution for large churches.",
      features: ["Unlimited Users", "Unlimited Children", "Unlimited Rooms", "Real-time Dashboard", "Custom Branding"],
      cta: "Start Free Trial",
      highlight: false
    }
  ];

  return (
    <div className="space-y-32 pb-24 dark:bg-gray-950 transition-colors">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-24 lg:pt-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Trusted by 500+ Churches</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
              Secure Child Check-In <br />
              <span className="text-primary dark:text-primary/70">for Your Church</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
              GuardianCheck provides a simple, secure, and scalable platform to manage child drop-off and pickup, giving parents peace of mind and volunteers more time to serve.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/register-church"
                className="bg-primary text-white px-8 py-4 rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none flex items-center justify-center space-x-2 animate-none"
              >
                <span>Start Free Trial</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/login?mode=signup"
                className="bg-purple-50 dark:bg-purple-900/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 px-8 py-4 rounded-xl font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-all flex items-center justify-center"
              >
                Join us as Parent
              </Link>
              <Link
                to="/login"
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-2 border-gray-100 dark:border-gray-800 px-8 py-4 rounded-xl font-semibold hover:border-primary dark:hover:border-primary/50 hover:text-primary dark:hover:text-primary/70 transition-all flex items-center justify-center"
              >
                Login
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-square rounded-3xl bg-primary/5 dark:bg-primary/10 overflow-hidden shadow-2xl border-8 border-white dark:border-gray-800">
              <img
                src="https://images.unsplash.com/photo-1510511233900-1982d92bd835?auto=format&fit=crop&q=80&w=1200&h=1200"
                alt="Secure Check-In Process"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 max-w-xs">
              <div className="flex items-center space-x-3 mb-2">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Live Attendance</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">124 Children</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Currently checked in across 5 rooms</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Everything You Need</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            GuardianCheck is built by church volunteers for church volunteers. We focus on security and simplicity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              viewport={{ once: true }}
              className="p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/30 dark:hover:border-primary/30 hover:shadow-xl transition-all group"
            >
              <div className="h-12 w-12 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Notification Section */}
      <section className="py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 relative">
            <div className="aspect-[16/9] rounded-3xl bg-gray-100 dark:bg-gray-800 overflow-hidden shadow-2xl">
              <img 
                src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1200&h=675" 
                alt="Real-time Mobile Notifications"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <div className="order-1 lg:order-2 space-y-6">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
              Real-time Peace of Mind for <span className="text-primary italic">Parents</span>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Parents receive instant mobile notifications when their child is checked in or moved between rooms. Full visibility, zero stress.
            </p>
            <ul className="space-y-4">
              <li className="flex items-center space-x-3 text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span>Instant Check-in alerts</span>
              </li>
              <li className="flex items-center space-x-3 text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span>Room transfer notifications</span>
              </li>
              <li className="flex items-center space-x-3 text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span>Secure pickup verification</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Choose the plan that fits your church size. All plans include a 14-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricing.map((plan, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              viewport={{ once: true }}
              className={`relative p-8 rounded-3xl border ${
                plan.highlight 
                  ? "bg-primary text-white shadow-2xl shadow-primary/10 dark:shadow-none" 
                  : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-900 dark:text-white"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className={`text-sm ${plan.highlight ? "text-primary/70" : "text-gray-500"}`}>{plan.description}</p>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-primary/70" : "text-gray-500"}`}>/month</span>
                </div>
                <ul className="space-y-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center space-x-3 text-sm">
                      <CheckCircle2 className={`h-5 w-5 ${plan.highlight ? "text-primary/70" : "text-primary"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={`/register-church?plan=${plan.name.toLowerCase()}`}
                  className={`w-full py-4 rounded-xl font-bold text-center block transition-all ${
                    plan.highlight 
                      ? "bg-white text-primary hover:bg-primary/10" 
                      : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-gray-50 dark:bg-gray-900/50 rounded-3xl p-12 lg:p-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
              Built for the <span className="text-primary">South African Church</span>
            </h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Fast & Reliable</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Optimized for local network conditions and mobile usage.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Local Payments</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Integrated with PayFast for secure, local Rand payments.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Mission Focused</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">We understand the unique needs of local ministries.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative">
             <div className="aspect-video rounded-2xl bg-gray-200 dark:bg-gray-800 overflow-hidden shadow-xl">
                <img 
                  src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=1200&h=675" 
                  alt="Classroom Management" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
             </div>
          </div>
        </div>
      </section>

      {/* Admin Section */}
      <section className="bg-gray-900 rounded-[3rem] p-12 lg:p-24 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[120px] rounded-full -mr-32 -mt-32" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="space-y-8">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Powerful Control for <span className="text-primary">Administrators</span>
            </h2>
            <p className="text-lg text-gray-400">
              Manage your entire congregation from a single dashboard. Track metrics, manage rooms, and ensure security protocols are followed across every event.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-2xl font-bold text-white">100%</p>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Compliance</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-2xl font-bold text-white">Offline</p>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Resilience</p>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              <img 
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200&h=675" 
                alt="Admin Dashboard Integration" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary rounded-3xl p-12 text-center space-y-8">
        <h2 className="text-4xl font-bold text-white">Ready to Secure Your Children's Ministry?</h2>
        <p className="text-white/70 text-xl max-w-2xl mx-auto">
          Join hundreds of churches using GuardianCheck to provide a safe and welcoming environment for families.
        </p>
        <Link
          to="/register-church"
          className="inline-block bg-white text-primary px-10 py-4 rounded-xl font-bold text-lg hover:bg-white/90 transition-colors shadow-xl"
        >
          Start Your Free Trial Now
        </Link>
      </section>

      <WhatsAppSupport 
        phoneNumber="+27796251393" 
        message="Hello, I'd like more information about GuardianCheck." 
        label="Chat with us"
      />
    </div>
  );
}
