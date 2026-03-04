import React from "react";
import { Shield, Info, AlertTriangle, CheckCircle } from "lucide-react";

const BurnoutProbabilityCard = ({ probability, confidence }) => {
  const getStatus = (prob) => {
    if (prob < 30)
      return {
        textColor: "text-emerald-400",
        iconBg: "bg-emerald-500/10",
        badgeClasses:
          "text-emerald-400 bg-emerald-500/10 border-emerald-400/20",
        label: "Low Risk",
        icon: <CheckCircle />,
        barColor: "from-emerald-500 to-emerald-400",
      };
    if (prob < 70)
      return {
        textColor: "text-amber-400",
        iconBg: "bg-amber-500/10",
        badgeClasses: "text-amber-400 bg-amber-500/10 border-amber-400/20",
        label: "Moderate Risk",
        icon: <Info />,
        barColor: "from-amber-500 to-amber-400",
      };
    return {
      textColor: "text-rose-400",
      iconBg: "bg-rose-500/10",
      badgeClasses: "text-rose-400 bg-rose-500/10 border-rose-400/20",
      label: "High Risk",
      icon: <AlertTriangle />,
      barColor: "from-rose-500 to-rose-400",
    };
  };

  const status = getStatus(probability);

  return (
    <div className="relative h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">
            7-Day Burnout Forecast
          </h3>
          <p className="text-sm text-white/60">
            Based on Linear Regression of last 30 days
          </p>
        </div>

        <div className={`p-2 rounded-xl ${status.iconBg}`}>
          <Shield size={20} className={status.textColor} />
        </div>
      </div>

      {/* Main Metric */}
      <div className="flex items-end gap-4 mb-4">
        <span
          className={`text-6xl font-bold tracking-tight ${status.textColor}`}
        >
          {probability}%
        </span>

        <div className="mb-2">
          <span
            className={`text-sm font-semibold uppercase px-3 py-1 rounded-full border ${status.badgeClasses}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full bg-gradient-to-r ${status.barColor} transition-all duration-1000`}
          style={{ width: `${probability}%` }}
        />
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-4 border-t border-white/10">
        <p className="text-xs text-white/60 font-medium">Model Confidence</p>
        <p className="text-sm font-mono text-white font-semibold">
          {confidence}%
        </p>
      </div>
    </div>
  );
};

export default BurnoutProbabilityCard;
