import React from "react";
import { Link } from "react-router-dom";
import { Shield, QrCode, ClipboardCheck, Users, ArrowRight, CheckCircle2 } from "lucide-react";
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

  return (
    <div className="space-y-24 pb-24 dark:bg-gray-950 transition-colors">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-24 lg:pt-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
              Secure Child Check-In <br />
              <span className="text-blue-600 dark:text-blue-400">for Your Church</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
              GuardianCheck provides a simple, secure, and scalable platform to manage child drop-off and pickup, giving parents peace of mind and volunteers more time to serve.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/login"
                className="bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/20 flex items-center justify-center space-x-2"
              >
                <span>Get Started</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/parent"
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-2 border-gray-100 dark:border-gray-800 px-8 py-4 rounded-xl font-semibold hover:border-blue-600 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center"
              >
                Parent Portal
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

      {/* CTA Section */}
      <section className="bg-blue-600 rounded-3xl p-12 text-center space-y-8">
        <h2 className="text-4xl font-bold text-white">Ready to Secure Your Children's Ministry?</h2>
        <p className="text-blue-100 text-xl max-w-2xl mx-auto">
          Join hundreds of churches using GuardianCheck to provide a safe and welcoming environment for families.
        </p>
        <Link
          to="/login"
          className="inline-block bg-white text-blue-600 px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-colors shadow-xl"
        >
          Get Started for Free
        </Link>
      </section>
    </div>
  );
}
