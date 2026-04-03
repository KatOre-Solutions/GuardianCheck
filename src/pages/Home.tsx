import React from "react";
import { Link } from "react-router-dom";
import { Shield, QrCode, ClipboardCheck, Users, ArrowRight, CheckCircle2, Star, Zap, Globe, Heart } from "lucide-react";
import { motion } from "motion/react";

export default function Home() {
  const features = [
    {
      icon: <QrCode className="h-6 w-6 text-blue-600" />,
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
      features: ["Up to 30 Children", "1 Active Room", "QR Check-In", "Basic Reports", "Email Support"],
      cta: "Start Free Trial",
      highlight: false
    },
    {
      name: "Growth",
      price: "R499",
      description: "Ideal for growing congregations.",
      features: ["Up to 150 Children", "Unlimited Rooms", "Advanced Reports", "Guardian Management", "Priority Email Support"],
      cta: "Start Free Trial",
      highlight: true
    },
    {
      name: "Professional",
      price: "R999",
      description: "Complete solution for large churches.",
      features: ["Unlimited Children", "Unlimited Rooms", "Real-time Dashboard", "Custom Branding", "24/7 Support"],
      cta: "Contact Sales",
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
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
              <Star className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Trusted by 500+ Churches</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
              Secure Child Check-In <br />
              <span className="text-blue-600 dark:text-blue-400">for Your Church</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
              GuardianCheck provides a simple, secure, and scalable platform to manage child drop-off and pickup, giving parents peace of mind and volunteers more time to serve.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/register-church"
                className="bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/20 flex items-center justify-center space-x-2"
              >
                <span>Start 14-Day Free Trial</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/login"
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-2 border-gray-100 dark:border-gray-800 px-8 py-4 rounded-xl font-semibold hover:border-blue-600 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center"
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
            <div className="aspect-square rounded-3xl bg-blue-50 dark:bg-blue-900/10 overflow-hidden shadow-2xl border-8 border-white dark:border-gray-800">
              <img
                src="https://picsum.photos/seed/church/800/800"
                alt="Church Child Check-In"
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
              className="p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-xl transition-all group"
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
                  ? "bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-200 dark:shadow-none" 
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
                  <p className={`text-sm ${plan.highlight ? "text-blue-100" : "text-gray-500"}`}>{plan.description}</p>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-blue-100" : "text-gray-500"}`}>/month</span>
                </div>
                <ul className="space-y-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center space-x-3 text-sm">
                      <CheckCircle2 className={`h-5 w-5 ${plan.highlight ? "text-blue-200" : "text-blue-600"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register-church"
                  className={`w-full py-4 rounded-xl font-bold text-center block transition-all ${
                    plan.highlight 
                      ? "bg-white text-blue-600 hover:bg-blue-50" 
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
              Built for the <span className="text-blue-600">South African Church</span>
            </h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Zap className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Fast & Reliable</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Optimized for local network conditions and mobile usage.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Globe className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Local Payments</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Integrated with PayFast for secure, local Rand payments.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Heart className="h-5 w-5 text-blue-600" />
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
                  src="https://picsum.photos/seed/community/800/450" 
                  alt="Community" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
             </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 rounded-3xl p-12 text-center space-y-8">
        <h2 className="text-4xl font-bold text-white">Ready to Secure Your Children's Ministry?</h2>
        <p className="text-blue-100 text-xl max-w-2xl mx-auto">
          Join hundreds of churches using GuardianCheck to provide a safe and welcoming environment for families.
        </p>
        <Link
          to="/register-church"
          className="inline-block bg-white text-blue-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-colors shadow-xl"
        >
          Start Your Free Trial Now
        </Link>
      </section>
    </div>
  );
}
