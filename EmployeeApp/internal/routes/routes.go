package routes

import (
	"employeeapp/internal/handlers"
	"employeeapp/internal/middleware"

	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORS())
	router.Use(middleware.Logger())

	// Initialize handlers
	employeeHandler := handlers.NewEmployeeHandler()

	// API routes
	api := router.Group("/api/v1")
	{
		employees := api.Group("/employees")
		{
			employees.GET("", employeeHandler.GetEmployees)
		}
	}

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"message": "Employee API is running",
		})
	})

	return router
}
