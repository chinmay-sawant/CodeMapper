package main

import (
	"employeeapp/internal/config"
	"employeeapp/internal/routes"
	"log"
)

func main() {
	cfg := config.Load()

	router := routes.SetupRouter()

	log.Printf("Server starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
