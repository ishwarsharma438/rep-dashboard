import CourseCards from '../components/CourseCards.jsx'

export default function CoursesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Your Courses</h1>

      <div className="mt-6">
        <CourseCards />
      </div>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">About This Program</h2>
        <div className="mt-2 space-y-2 font-body text-sm leading-relaxed text-gray-600">
          <p>
            The Resilient Educators Partnership brings together four self-paced courses designed to
            support your wellbeing and practice across the school year.
          </p>
          <p>
            Work through them in your own time — progress saves automatically in Canvas, and your
            completion is reflected here as you go.
          </p>
          <p>
            Courses unlock as the program progresses, so any marked "Not enrolled yet" will become
            available at the relevant stage.
          </p>
        </div>
      </section>
    </div>
  )
}
